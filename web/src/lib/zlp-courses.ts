/**
 * Zachry Leadership Program courses. These are the classes the cohort is
 * trying to schedule together, so a student already enrolled in one must NOT
 * count as "busy" when we look for the cohort's 100-minute meeting window.
 */
export const ZLP_SUBJECT = "ENGR";
export const ZLP_COURSE_NUMBERS = new Set(["251", "350", "351", "450", "451"]);

export function isZlpCourse(subject: string, number: string): boolean {
  const subj = subject.trim().toUpperCase();
  const num = number.trim().replace(/[^0-9]/g, "");
  return subj === ZLP_SUBJECT && ZLP_COURSE_NUMBERS.has(num);
}
