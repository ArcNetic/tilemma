import { CheckIcon } from "./icons.js";

export type ToastProps = {
  message: string | null;
};

export const Toast = ({ message }: ToastProps) => (
  <div className="toast-region" role="status" aria-live="polite">
    {message && (
      <div className="toast" key={message} data-testid="toast">
        <span className="toast-mark" aria-hidden="true">
          <CheckIcon />
        </span>
        {message}
      </div>
    )}
  </div>
);
