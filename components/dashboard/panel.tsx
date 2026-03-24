import { ReactNode } from "react";

type PanelProps = {
  title: string;
  subtitle?: string;
  children: ReactNode;
  className?: string;
  titleClassName?: string;
};

export function Panel({ title, subtitle, children, className, titleClassName }: PanelProps) {
  const panelClassName = [
    "rounded-2xl border border-gray-200 bg-white p-6 shadow-sm transition-colors duration-200 dark:border-gray-700 dark:bg-gray-800",
    className,
  ]
    .filter(Boolean)
    .join(" ");
  const resolvedTitleClassName = [
    "text-lg font-semibold text-gray-900 transition-colors duration-200 dark:text-white",
    titleClassName,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <section className={panelClassName}>
      <header className="mb-4">
        <h2 className={resolvedTitleClassName}>{title}</h2>
        {subtitle ? (
          <p className="mt-1 text-sm text-gray-500 transition-colors duration-200 dark:text-gray-400">
            {subtitle}
          </p>
        ) : null}
      </header>
      {children}
    </section>
  );
}
