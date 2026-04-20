import Head from 'next/head';
import { useEffect } from 'react';
import fs from 'fs';
import path from 'path';

import { DynamicComponent } from '@/components/components-registry';
import { PageComponentProps } from '@/types';
import { allContent } from '@/utils/content';
import { seoGenerateMetaDescription, seoGenerateMetaTags, seoGenerateTitle } from '@/utils/seo-utils';
import { resolveStaticProps } from '@/utils/static-props-resolvers';

const Page: React.FC<PageComponentProps & StaticPreviewProps> = (props) => {
    if (props.staticRedirect) {
        return <StaticRedirect to={props.staticRedirect} />;
    }

    if (props.staticPreview) {
        return <StaticPreviewPage {...props.staticPreview} />;
    }

    const { global, ...page } = props;
    const { site } = global;
    const title = seoGenerateTitle(page, site);
    const metaTags = seoGenerateMetaTags(page, site);
    const metaDescription = seoGenerateMetaDescription(page, site);

    return (
        <>
            <Head>
                <title>{title}</title>
                {metaDescription && <meta name="description" content={metaDescription} />}
                {metaTags.map((metaTag) => {
                    if (metaTag.format === 'property') {
                        // OpenGraph meta tags (og:*) should be have the format <meta property="og:…" content="…">
                        return <meta key={metaTag.property} property={metaTag.property} content={metaTag.content} />;
                    }
                    return <meta key={metaTag.property} name={metaTag.property} content={metaTag.content} />;
                })}
                <meta name="viewport" content="width=device-width, initial-scale=1" />
                {site.favicon && <link rel="icon" href={site.favicon} />}
            </Head>
            <DynamicComponent {...props} />
        </>
    );
};

type StaticPreviewProps = {
    staticPreview?: {
        title: string;
        description?: string;
        styleHref: string;
        inlineStyle?: string;
        bodyHtml: string;
    };
    staticRedirect?: string;
};

function StaticRedirect({ to }: { to: string }) {
    useEffect(() => {
        window.location.replace(to);
    }, [to]);

    return (
        <>
            <Head>
                <title>Redirecting...</title>
                <meta httpEquiv="refresh" content={`0; url=${to}`} />
            </Head>
            <main style={{ padding: '3rem', fontFamily: 'monospace' }}>
                Redirecting to <a href={to}>{to}</a>
            </main>
        </>
    );
}

function StaticPreviewPage({ title, description, styleHref, inlineStyle, bodyHtml }: StaticPreviewProps['staticPreview']) {
    return (
        <>
            <Head>
                <title>{title}</title>
                {description && <meta name="description" content={description} />}
                <meta name="viewport" content="width=device-width, initial-scale=1" />
                <link rel="preconnect" href="https://fonts.googleapis.com" />
                <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
                <link
                    href="https://fonts.googleapis.com/css2?family=Azeret+Mono:ital,wght@0,400;0,500;0,600;1,400;1,500&family=DM+Mono:ital,wght@0,400;0,500;1,400;1,500&display=swap"
                    rel="stylesheet"
                />
                <link rel="stylesheet" href={styleHref} />
                {inlineStyle && <style dangerouslySetInnerHTML={{ __html: inlineStyle }} />}
            </Head>
            <div dangerouslySetInnerHTML={{ __html: bodyHtml }} />
        </>
    );
}

const STATIC_ROUTE_MAP = {
    '/': 'home.html',
    '/projects': 'projects.html',
    '/info': 'info.html',
    '/projects/cards-project': 'project-cards.html'
};

const STATIC_REDIRECTS = {
    '/projects/hf-risk-journal': '/hf-risk/index.html'
};

function normalizeRoutePath(urlPath: string) {
    if (urlPath.length > 1 && urlPath.endsWith('/')) {
        return urlPath.slice(0, -1);
    }
    return urlPath;
}

function buildStaticPreviewProps(urlPath: string) {
    const routePath = normalizeRoutePath(urlPath);
    const redirect = STATIC_REDIRECTS[routePath];
    if (redirect) {
        return { staticRedirect: redirect };
    }

    const fileName = STATIC_ROUTE_MAP[routePath];
    if (!fileName) {
        return null;
    }

    const filePath = path.join(process.cwd(), 'public', 'site-preview', fileName);
    const raw = fs.readFileSync(filePath, 'utf8');
    const title = raw.match(/<title>([\s\S]*?)<\/title>/i)?.[1]?.trim() || 'Nikunj Prajapati';
    const description = raw.match(/<meta\s+name="description"\s+content="([^"]*)"/i)?.[1];
    const inlineStyle = raw.match(/<style>([\s\S]*?)<\/style>/i)?.[1] || '';
    const bodyHtml = rewriteStaticPreviewLinks(raw.match(/<body[^>]*>([\s\S]*?)<\/body>/i)?.[1] || '', routePath);

    return {
        staticPreview: {
            title,
            description,
            styleHref: '/site-preview/site.css',
            inlineStyle,
            bodyHtml
        }
    };
}

function rewriteStaticPreviewLinks(html: string, routePath: string) {
    const rewrites: Record<string, string> = {
        'home.html': '/',
        'index.html': '/',
        'projects.html': '/projects/',
        'info.html': '/info/',
        'project-cards.html': '/projects/cards-project/',
        '../hf-risk/index.html': '/hf-risk/index.html',
        'site.css': '/site-preview/site.css'
    };

    let output = html;
    for (const [from, to] of Object.entries(rewrites)) {
        output = output.replaceAll(`href="${from}"`, `href="${to}"`);
        output = output.replaceAll(`src="${from}"`, `src="${to}"`);
    }

    if (routePath === '/projects/cards-project') {
        output = output.replaceAll('href="#"', 'href="https://github.com/Nik85-png/auto-annotated-portfolio-9bdeb"');
    }

    return output;
}

export function getStaticPaths() {
    const allData = allContent();
    const paths = allData.map((obj) => obj.__metadata.urlPath).filter(Boolean);
    return { paths, fallback: false };
}

export function getStaticProps({ params }) {
    const allData = allContent();
    const urlPath = '/' + (params.slug || []).join('/');
    const staticProps = buildStaticPreviewProps(urlPath);
    if (staticProps) {
        return { props: { ...staticProps } };
    }
    const props = resolveStaticProps(urlPath, allData);
    return { props };
}

export default Page;
