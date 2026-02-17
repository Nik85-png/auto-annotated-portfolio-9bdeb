import classNames from 'classnames';

import { Annotated } from '@/components/Annotated';
import { DynamicComponent } from '@/components/components-registry';
import { mapStylesToClassNames as mapStyles } from '@/utils/map-styles-to-class-names';

export default function FormBlock(props) {
    const { elementId, className, fields = [], submitLabel, styles = {} } = props;
    const formName = elementId || 'contact-form';

    if (fields.length === 0) {
        return null;
    }

    return (
        <Annotated content={props}>
            <form
                className={className}
                name={formName}
                id={formName}
                method="POST"
                action="/thanks"
                data-netlify="true"
                netlify-honeypot="bot-field"
            >
                <div className="grid gap-6 sm:grid-cols-2">
                    <input type="hidden" name="form-name" value={formName} />
                    <input type="hidden" name="bot-field" />
                    {fields.map((field, index) => {
                        return <DynamicComponent key={index} {...field} />;
                    })}
                </div>
                <div className={classNames('mt-8', mapStyles({ textAlign: styles.self?.textAlign ?? 'left' }))}>
                    <button
                        type="submit"
                        className="inline-flex items-center justify-center px-5 py-4 text-lg transition border-2 border-current hover:bottom-shadow-6 hover:-translate-y-1.5"
                    >
                        {submitLabel}
                    </button>
                </div>
            </form>
        </Annotated>
    );
}
