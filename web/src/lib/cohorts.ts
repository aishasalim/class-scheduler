export type Participant = {
  id: string;
  name: string;
  major: string;
  gender: string;
  birthday: string;
  phone: string;
};

export type Cohort = {
  id: string;
  name: string;
  semester: string;
  participants: Participant[];
};

const COHORT_K_PARTICIPANTS: Participant[] = [
  { id: "yohan-abraham", name: "Yohan Abraham", major: "Computer Engineering", gender: "M", birthday: "June 10", phone: "4322718963" },
  { id: "daniel-beltran", name: "Daniel Beltran", major: "Aerospace Engineering", gender: "M", birthday: "November 29", phone: "6825217143" },
  { id: "tejas-bharadwaj", name: "Tejas Bharadwaj", major: "Electrical Engineering", gender: "M", birthday: "September 9", phone: "6577882699" },
  { id: "jeannette-boyd", name: "Jeannette Boyd", major: "Biomedical Engineering", gender: "F", birthday: "December 16", phone: "2142501613" },
  { id: "michael-connell", name: "Michael Connell", major: "Electrical Engineering", gender: "M", birthday: "July 14", phone: "2817105070" },
  { id: "oliver-crantz", name: "Oliver Crantz", major: "Petroleum Engineering", gender: "M", birthday: "February 17", phone: "7138652139" },
  { id: "jacob-daniel", name: "Jacob Daniel", major: "Electrical Engineering", gender: "M", birthday: "October 20", phone: "2144992360" },
  { id: "travis-daugherty", name: "Travis Daugherty", major: "Mechanical Engineering", gender: "M", birthday: "February 28", phone: "3463667016" },
  { id: "devansh-dayal", name: "Devansh Dayal", major: "Mechanical Engineering", gender: "M", birthday: "December 27", phone: "9797091922" },
  { id: "ben-fullen", name: "Ben Fullen", major: "Mechanical Engineering", gender: "M", birthday: "October 27", phone: "2819679302" },
  { id: "laura-gonzalez", name: "Laura Gonzalez", major: "Mechanical Engineering", gender: "F", birthday: "September 27", phone: "9725058788" },
  { id: "marcus-gou", name: "Marcus Gou", major: "Mechanical Engineering", gender: "M", birthday: "October 25", phone: "8326107725" },
  { id: "lohendra-hariharan", name: "Lohendra Hariharan", major: "Electrical Engineering", gender: "M", birthday: "May 25", phone: "4694682028" },
  { id: "erin-heilbrun", name: "Erin Heilbrun", major: "Environmental Engineering", gender: "F", birthday: "July 31", phone: "2108015288" },
  { id: "carson-hopper", name: "Carson Hopper", major: "Mechanical Engineering", gender: "M", birthday: "November 8", phone: "8324774832" },
  { id: "ikanke-itina", name: "Ikanke Itina", major: "Chemical Engineering", gender: "F", birthday: "January 5", phone: "8323480150" },
  { id: "deepna-kanjee", name: "Deepna Kanjee", major: "Architectural Engineering", gender: "F", birthday: "September 28", phone: "9366712812" },
  { id: "ananda-maharaj", name: "Ananda Maharaj", major: "Electrical Engineering", gender: "F", birthday: "April 3", phone: "5127740580" },
  { id: "raul-martinez", name: "Raul Martinez", major: "Civil Engineering", gender: "M", birthday: "July 9", phone: "8322748548" },
  { id: "zoe-mccaskey", name: "Zoe McCaskey", major: "Mechanical Engineering", gender: "F", birthday: "April 24", phone: "5125506116" },
  { id: "graham-moore", name: "Graham Moore", major: "Mechanical Engineering", gender: "M", birthday: "December 22", phone: "9727411294" },
  { id: "yuki-nakada", name: "Yuki Nakada", major: "Chemical Engineering", gender: "F", birthday: "May 2", phone: "8323648309" },
  { id: "absana-phuyal", name: "Absana Phuyal", major: "Computer Engineering", gender: "F", birthday: "October 30", phone: "8174758090" },
  { id: "angel-pilli", name: "Angel Pilli", major: "Architectural Engineering", gender: "F", birthday: "February 27", phone: "2142232254" },
  { id: "aryana-rabee", name: "Aryana Rabee", major: "Industrial Distribution Engineering", gender: "F", birthday: "September 23", phone: "8326148350" },
  { id: "aisha-salimgereyeva", name: "Aisha Salimgereyeva", major: "Computer Engineering", gender: "F", birthday: "August 11", phone: "7542779703" },
  { id: "sofia-sirgo", name: "Sofia Sirgo", major: "Biomedical Engineering", gender: "F", birthday: "November 1", phone: "4693899575" },
  { id: "audrey-spence", name: "Audrey Spence", major: "General Engineering", gender: "F", birthday: "June 20", phone: "9729752337" },
  { id: "jacob-stahl", name: "Jacob Stahl", major: "Chemical Engineering", gender: "M", birthday: "May 27", phone: "6063318530" },
  { id: "carter-stein", name: "Carter Stein", major: "Mechanical Engineering", gender: "M", birthday: "March 11", phone: "9727427221" },
  { id: "asmita-subash", name: "Asmita Subash", major: "Multidisciplinary Engineering Technology", gender: "F", birthday: "January 9", phone: "8323780343" },
];

export const COHORTS: Record<string, Cohort> = {
  K: {
    id: "K",
    name: "Cohort K",
    semester: "Spring 2026",
    participants: COHORT_K_PARTICIPANTS,
  },
};

export const ACTIVE_COHORT_IDS = Object.keys(COHORTS);

export function getCohort(id: string): Cohort | undefined {
  return COHORTS[id.toUpperCase()];
}

export function normalizeCohortId(id: string): string {
  return id.toUpperCase();
}

/**
 * The extension import password for a cohort. Hardcoded and derived from the
 * cohort code, e.g. cohort "K" → "cohort-k-superpassword". No per-cohort setup.
 */
export function cohortImportPassword(id: string): string {
  return `cohort-${id.toLowerCase()}-superpassword`;
}
