import { generateGlobalCssVariables } from '@/utils/theme-style-utils';
import { useEffect, useState } from 'react';
import '../css/main.css';

export default function MyApp({ Component, pageProps }) {
    const { global, ...page } = pageProps;
    const { theme } = global || {};
    const [isMounted, setIsMounted] = useState(false);

    const cssVars = generateGlobalCssVariables(theme);

    useEffect(() => {
        setIsMounted(true);
        document.body.setAttribute('data-theme', page.colors || 'colors-a');
    }, [page.colors]);

    useEffect(() => {
        const externalEmbedUrl = process.env.NEXT_PUBLIC_CARDS_EMBED_URL;
        if (!externalEmbedUrl) return;

        function rewriteCardEmbeds() {
            const iframes = document.querySelectorAll("iframe[data-cards-embed='1']");
            iframes.forEach((iframe) => {
                const currentSrc = iframe.getAttribute('src') || '';
                if (currentSrc.startsWith(externalEmbedUrl)) return;
                const joiner = externalEmbedUrl.includes('?') ? '&' : '?';
                iframe.src = `${externalEmbedUrl}${joiner}embed=1`;
            });
        }

        rewriteCardEmbeds();
        const observer = new MutationObserver(() => rewriteCardEmbeds());
        observer.observe(document.body, { childList: true, subtree: true });

        return () => observer.disconnect();
    }, []);

    useEffect(() => {
        const enablePlayground = (process.env.NEXT_PUBLIC_ENABLE_PLAYGROUND || '').toLowerCase() === 'true';
        if (!enablePlayground) return;

        const externalEmbedUrl = process.env.NEXT_PUBLIC_CARDS_EMBED_URL || '';
        const playUrl = `${externalEmbedUrl.replace(/\/+$/, '')}/play`;

        function revealPlaygroundCtas() {
            const links = document.querySelectorAll("[data-cards-play-cta='1']");
            links.forEach((link) => {
                link.style.display = 'inline-block';
                if (externalEmbedUrl) {
                    link.setAttribute('href', playUrl);
                }
            });
        }

        revealPlaygroundCtas();
        const observer = new MutationObserver(() => revealPlaygroundCtas());
        observer.observe(document.body, { childList: true, subtree: true });
        return () => observer.disconnect();
    }, []);

    useEffect(() => {
        const minHeight = 520;
        const maxHeight = 1800;
        const threshold = 8;
        const configuredOrigins = (process.env.NEXT_PUBLIC_CARDS_EMBED_ORIGIN || '')
            .split(',')
            .map((item) => item.trim())
            .filter(Boolean);

        function isAllowedOrigin(origin) {
            if (!origin) return false;
            if (origin === window.location.origin) return true;
            if (configuredOrigins.length === 0) {
                return false;
            }
            return configuredOrigins.includes(origin);
        }

        function handleMessage(event) {
            if (!isAllowedOrigin(event.origin)) return;
            const data = event.data || {};
            if (data.type !== 'cards-embed-height' || typeof data.height !== 'number') return;

            const targetHeight = Math.max(minHeight, Math.min(maxHeight, Math.ceil(data.height)));
            const iframes = document.querySelectorAll("iframe[data-cards-embed='1']");

            iframes.forEach((iframe) => {
                const current = parseInt(iframe.style.height || '0', 10) || minHeight;
                if (Math.abs(current - targetHeight) <= threshold) return;
                iframe.style.height = `${targetHeight}px`;
            });
        }

        window.addEventListener('message', handleMessage);
        return () => window.removeEventListener('message', handleMessage);
    }, []);

    return (
        <>
            <style jsx global>{`
                :root {
                    ${cssVars}
                }
            `}</style>
            {isMounted ? <Component {...pageProps} /> : null}
        </>
    );
}
