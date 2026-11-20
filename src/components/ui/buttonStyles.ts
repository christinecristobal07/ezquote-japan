import { cva } from 'class-variance-authority';

export const buttonStyles = cva(
  'inline-flex items-center justify-center gap-2 rounded-md font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-60',
  {
    variants: {
      variant: {
        primary: 'bg-brand-600 text-white hover:bg-brand-700 disabled:hover:bg-brand-600',
        secondary:
          'border border-slate-300 bg-white text-slate-800 hover:bg-slate-50 disabled:hover:bg-white',
        ghost: 'text-slate-700 hover:bg-slate-100 disabled:hover:bg-transparent',
        danger: 'bg-red-700 text-white hover:bg-red-800 disabled:hover:bg-red-700',
      },
      size: {
        sm: 'h-8 px-3 text-sm',
        md: 'h-10 px-4 text-sm',
        lg: 'h-11 px-5 text-base',
      },
    },
    defaultVariants: { variant: 'primary', size: 'md' },
  },
);
