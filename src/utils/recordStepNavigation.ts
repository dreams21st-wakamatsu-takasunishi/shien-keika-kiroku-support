export interface FieldStepReference {
  id: string;
  kind: string;
  sectionId?: string;
  fieldId?: string;
}

export function findFieldStepId(steps: FieldStepReference[], sectionId: string, fieldId: string): string | undefined {
  return steps.find((step) => step.kind === 'field'
    && step.sectionId === sectionId && step.fieldId === fieldId)?.id;
}
