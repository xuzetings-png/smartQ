import type { ReactNode } from 'react';

type Props = {
  step: number;
  children: ReactNode;
};

export function StepTitle({ step, children }: Props) {
  return (
    <>
      <span className="step-index">{step}</span>
      {children}
    </>
  );
}
