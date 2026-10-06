import * as DialogPrimitive from "@radix-ui/react-dialog";
import * as Dropdown from "@radix-ui/react-dropdown-menu";
import { X, ChevronDown } from "lucide-react";
import type { ReactNode, ButtonHTMLAttributes } from "react";
import { clsx } from "clsx";
export function Button({
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement>) {
  return <button className={clsx("button", className)} {...props} />;
}
export function Modal({
  open,
  onOpenChange,
  title,
  description,
  children,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="dialog-overlay" />
        <DialogPrimitive.Content className="dialog-content">
          <DialogPrimitive.Title>{title}</DialogPrimitive.Title>
          <DialogPrimitive.Description>
            {description || "Review the details below."}
          </DialogPrimitive.Description>
          <DialogPrimitive.Close
            className="icon-button dialog-close"
            aria-label="Close"
          >
            <X size={18} />
          </DialogPrimitive.Close>
          {children}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
export function Menu({
  label,
  children,
}: {
  label: ReactNode;
  children: ReactNode;
}) {
  return (
    <Dropdown.Root>
      <Dropdown.Trigger asChild>
        <Button>
          {label}
          <ChevronDown size={13} />
        </Button>
      </Dropdown.Trigger>
      <Dropdown.Portal>
        <Dropdown.Content className="dropdown" sideOffset={6}>
          {children}
        </Dropdown.Content>
      </Dropdown.Portal>
    </Dropdown.Root>
  );
}
export function MenuItem({
  children,
  onSelect,
}: {
  children: ReactNode;
  onSelect: () => void;
}) {
  return (
    <Dropdown.Item className="menu-item" onSelect={onSelect}>
      {children}
    </Dropdown.Item>
  );
}
export function Badge({ status }: { status: string }) {
  return (
    <span className={"badge " + status}>
      <span />
      {status}
    </span>
  );
}
export function Empty({
  title = "No results in this window",
  text = "Try a wider time range or adjust your filters.",
}: {
  title?: string;
  text?: string;
}) {
  return (
    <div className="empty">
      <strong>{title}</strong>
      <p>{text}</p>
    </div>
  );
}
export function Loading() {
  return (
    <div className="skeleton" role="status" aria-label="Loading data">
      <div />
      <div />
      <div />
    </div>
  );
}
export function ErrorState({
  error,
  retry,
}: {
  error: Error;
  retry: () => void;
}) {
  return (
    <div className="error-state" role="alert">
      <strong>We couldn’t load this view</strong>
      <p>{error.message}</p>
      <Button onClick={retry}>Try again</Button>
    </div>
  );
}
