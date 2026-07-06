/** Visual indicator for required form fields, announced to screen readers. */
export function RequiredMark() {
  return (
    <span className="ml-0.5 text-destructive">
      <span aria-hidden="true">*</span>
      <span className="sr-only">obrigatório</span>
    </span>
  );
}
