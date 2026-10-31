import React from "react";

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "danger" | "ghost" | "outline";
  size?: "sm" | "md" | "lg";
  isLoading?: boolean;
}

export const Button: React.FC<ButtonProps> = ({
  children,
  variant = "secondary",
  size = "md",
  isLoading = false,
  className = "",
  disabled,
  ...props
}) => {
  return (
    <button
      className={`btn btn-${variant} btn-${size} ${isLoading ? "is-loading" : ""} ${className}`}
      disabled={disabled || isLoading}
      {...props}
    >
      {isLoading && <span className="btn-spinner" aria-hidden="true" />}
      <span className="btn-label">{children}</span>
    </button>
  );
};

export interface BadgeProps {
  variant?: "default" | "success" | "warning" | "danger" | "info" | "neutral";
  symbol?: string;
  children: React.ReactNode;
  className?: string;
  title?: string;
}

export const Badge: React.FC<BadgeProps> = ({
  variant = "default",
  symbol,
  children,
  className = "",
  title,
}) => {
  return (
    <span className={`badge badge-${variant} ${className}`} title={title}>
      {symbol && (
        <span className="badge-symbol" aria-hidden="true">
          {symbol}{" "}
        </span>
      )}
      <span className="badge-text">{children}</span>
    </span>
  );
};

export interface LoadingStateProps {
  message?: string;
  subtitle?: string;
}

export const LoadingState: React.FC<LoadingStateProps> = ({
  message = "Loading data…",
  subtitle,
}) => {
  return (
    <div className="state-box state-loading" role="status" aria-live="polite">
      <div className="spinner" aria-hidden="true" />
      <div className="state-text">
        <h4 className="state-title">{message}</h4>
        {subtitle && <p className="state-subtitle">{subtitle}</p>}
      </div>
    </div>
  );
};

export interface EmptyStateProps {
  icon?: string;
  title: string;
  description: string;
  action?: React.ReactNode;
}

export const EmptyState: React.FC<EmptyStateProps> = ({
  icon = "∅",
  title,
  description,
  action,
}) => {
  return (
    <div className="state-box state-empty">
      <div className="state-icon" aria-hidden="true">
        {icon}
      </div>
      <h4 className="state-title">{title}</h4>
      <p className="state-subtitle">{description}</p>
      {action && <div className="state-action">{action}</div>}
    </div>
  );
};

export interface ErrorBannerProps {
  title?: string;
  message: string;
  code?: string;
  retryable?: boolean;
  onRetry?: () => void;
  onDismiss?: () => void;
}

export const ErrorBanner: React.FC<ErrorBannerProps> = ({
  title = "Error Encountered",
  message,
  code,
  retryable,
  onRetry,
  onDismiss,
}) => {
  return (
    <div className="banner banner-error" role="alert">
      <div className="banner-icon" aria-hidden="true">
        ⚠
      </div>
      <div className="banner-content">
        <div className="banner-header">
          <strong className="banner-title">{title}</strong>
          {code && <code className="banner-code">[{code}]</code>}
        </div>
        <p className="banner-message">{message}</p>
        <div className="banner-actions">
          {retryable && onRetry && (
            <Button size="sm" variant="primary" onClick={onRetry}>
              Retry Operation
            </Button>
          )}
          {onDismiss && (
            <Button size="sm" variant="ghost" onClick={onDismiss}>
              Dismiss
            </Button>
          )}
        </div>
      </div>
    </div>
  );
};
