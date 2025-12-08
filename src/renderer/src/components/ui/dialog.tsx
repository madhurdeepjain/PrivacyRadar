import * as React from 'react'
import { X } from 'lucide-react'
import { cn } from '@renderer/lib/utils'
import { Button } from './button'

interface DialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  children: React.ReactNode
}

export function Dialog({ open, onOpenChange, children }: DialogProps): React.JSX.Element | null {
  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      onClick={() => onOpenChange(false)}
    >
      {/* Backdrop */}
      <div className="fixed inset-0 bg-black/50 backdrop-blur-sm animate-in fade-in duration-200" />

      {/* Dialog Content */}
      <div className="relative z-50 w-full max-w-md mx-4" onClick={(e) => e.stopPropagation()}>
        {children}
      </div>
    </div>
  )
}

interface DialogContentProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode
}

export function DialogContent({
  children,
  className,
  ...props
}: DialogContentProps): React.JSX.Element {
  return (
    <div
      className={cn(
        'bg-card border rounded-lg shadow-lg animate-in fade-in slide-in-from-bottom-2 duration-200',
        className
      )}
      {...props}
    >
      {children}
    </div>
  )
}

interface DialogHeaderProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode
}

export function DialogHeader({
  children,
  className,
  ...props
}: DialogHeaderProps): React.JSX.Element {
  return (
    <div className={cn('flex flex-col space-y-1.5 p-6 pb-4', className)} {...props}>
      {children}
    </div>
  )
}

interface DialogTitleProps extends React.HTMLAttributes<HTMLHeadingElement> {
  children: React.ReactNode
}

export function DialogTitle({
  children,
  className,
  ...props
}: DialogTitleProps): React.JSX.Element {
  return (
    <h2 className={cn('text-lg font-semibold leading-none tracking-tight', className)} {...props}>
      {children}
    </h2>
  )
}

interface DialogCloseProps {
  onClose: () => void
}

export function DialogClose({ onClose }: DialogCloseProps): React.JSX.Element {
  return (
    <Button
      variant="ghost"
      size="icon"
      className="absolute right-4 top-4 h-6 w-6 rounded-sm opacity-70 hover:opacity-100"
      onClick={onClose}
    >
      <X className="h-4 w-4" />
      <span className="sr-only">Close</span>
    </Button>
  )
}
