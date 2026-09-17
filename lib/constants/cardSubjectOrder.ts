// The order the learning areas print on the report card / SF9.
//
// The issued Learner's Progress Report Card lists the learning areas in a
// fixed DepEd sequence, not alphabetically:
//
//   Filipino · English · Mathematics · Science · Araling Panlipunan ·
//   Values Education · EPP/TLE · MAPEH · General Average
//
// Until this, the card and SF9 had no sequence at all: `buildCardSubjectRows`
// sorted on the subject's `code` (migration 153 imposed that much, to stop the
// print order being the insertion order of `sms_grades`), so ordinary codes
// printed AP · English · ESP · Filipino · MAPEH · Math · Science · TLE — wrong
// in almost every position. SF10 and Form 137 have always had the sequence,
// because they are built from fixed key lists (`JHS_SUBJECTS` and friends in
// `lib/pdf/generateSf10.ts`); the card is built from whatever subjects the
// school actually created, so it needs a rank rather than a list.
//
// This is a RANK, never a roster: an area nobody teaches simply does not
// appear, and a subject that matches nothing here is not dropped — it keeps
// sorting by code, after the recognised areas, exactly as the whole card did
// before. That is what makes the rule safe for the lists it was never written
// for (ALS learning strands, SPA specialisations, Homeroom Guidance).
//
// Matching is on the subject's own code and name because neither DepEd nor
// this database carries a learning-area key on `sms_subjects` — there is only
// `lib/constants/learningAreas.ts`, which is the teaching-SPECIALIZATION
// picker on a staff record and is never attached to a subject. A column would
// be the sturdier answer and is a migration, not a constant; this reads what
// every school already types, and a school whose codes are idiosyncratic is no
// worse off than it is today.
//
// Codes are matched as a prefix that must not run into another letter, so
// `FIL7`, `FIL-7` and `Filipino` all read as Filipino while `APPLIED` is not
// Araling Panlipunan. Names are matched on whole words.

/** One area of the printed sequence. Position in the array IS the rank. */
interface CardLearningArea {
  key: string;
  /** Tested against the subject code, stripped to letters and digits. */
  code?: RegExp;
  /** Tested against the subject name, punctuation collapsed to spaces. */
  name?: RegExp;
}

// In print order. The MATATAG primary areas (Language, Reading and Literacy,
// GMRC, Makabansa) are ranked here too: they never share a card with the
// Grades 4-10 areas — a subject belongs to one grade level — so one list
// reproduces both sequences, including the issued Grades 1-3 sheet's
// Mathematics · GMRC · Makabansa, which is why GMRC sits above Araling
// Panlipunan and Makabansa below Values Education.
const CARD_LEARNING_AREAS: CardLearningArea[] = [
  { key: "language", code: /^(lang|language)(?![a-z])/, name: /^language\b/ },
  {
    key: "reading_literacy",
    code: /^(rl|read|reading)(?![a-z])/,
    // The whole phrase, never a bare "reading" or a bare "literacy": Senior
    // High's "Reading and Writing Skills" and "Media and Information Literacy"
    // are different subjects and must not be hoisted to the top of the card.
    name: /\breading and literacy\b/,
  },
  {
    key: "mother_tongue",
    code: /^(mt|mtb|mtbmle)(?![a-z])/,
    name: /\bmother tongue\b|\bmtb\b/,
  },
  { key: "filipino", code: /^(fil|filipino)(?![a-z])/, name: /\bfilipino\b/ },
  { key: "english", code: /^(eng|english)(?![a-z])/, name: /\benglish\b/ },
  {
    key: "mathematics",
    code: /^(math|mathematics|mtk)(?![a-z])/,
    name: /\bmath\b|\bmathematics\b|\bmatematika\b/,
  },
  {
    key: "science",
    code: /^(sci|science)(?![a-z])/,
    name: /\bscience\b|\bagham\b/,
  },
  { key: "gmrc", code: /^(gmrc)(?![a-z])/, name: /\bgmrc\b|\bgood manners\b/ },
  {
    key: "araling_panlipunan",
    code: /^(ap|arpan|hekasi|sibika)(?![a-z])/,
    name: /\baraling panlipunan\b|\bhekasi\b|\bsibika\b/,
  },
  {
    // Values Education under MATATAG, Edukasyon sa Pagpapakatao before it.
    key: "values_education",
    code: /^(ve|esp|vaued|values)(?![a-z])/,
    name: /\bvalues education\b|\bedukasyon sa pagpapakatao\b|\besp\b/,
  },
  { key: "makabansa", code: /^(mak|makabansa)(?![a-z])/, name: /\bmakabansa\b/ },
  {
    // The computed EPP/TLE parent (migration 174) ranks by its own caption,
    // which is "EPP" in Grades 1-6 and "TLE" from Grade 7.
    key: "tle",
    code: /^(tle|epp|eppt|hele)(?![a-z])/,
    name: /\btle\b|\bepp\b|\btechnology and livelihood\b|\bedukasyong pantahanan\b/,
  },
  {
    // The computed MAPEH parent (migrations 153/155). Deliberately narrow: an
    // UNTAGGED "Music" or "Arts" subject is left in the unranked block rather
    // than guessed into the learning area, because guessing would also catch
    // Senior High's "Contemporary Philippine Arts from the Regions". Tagging
    // `mapeh_component` is what folds a component in, and it already does.
    key: "mapeh",
    code: /^(mapeh)(?![a-z])/,
    name: /\bmapeh\b/,
  },
  // The Madrasah pair prints last of the recognised areas, as it does on SF10.
  { key: "arabic", code: /^(arab|arabic)(?![a-z])/, name: /\barabic\b/ },
  {
    key: "islamic_values",
    code: /^(ive|islamic)(?![a-z])/,
    name: /\bislamic values\b/,
  },
];

/**
 * The rank of anything the sequence does not name: after every recognised
 * area, where it keeps sorting by code among its own kind.
 */
export const UNRANKED_SUBJECT = CARD_LEARNING_AREAS.length;

const normalizeCode = (value: string): string =>
  value.toLowerCase().replace(/[^a-z0-9]/g, "");

const normalizeName = (value: string): string =>
  value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

/**
 * Where a subject falls in the printed sequence, `UNRANKED_SUBJECT` when it is
 * none of them.
 *
 * The code is consulted first and the name second, so a school that codes its
 * subjects conventionally is placed on the code and one that does not is still
 * placed on the name it types on every form. Areas are tested in print order,
 * which is what settles the handful of names that could read as two of them
 * ("Mother Tongue (Filipino)" is Mother Tongue, not Filipino).
 */
export function cardSubjectRank(
  code?: string | null,
  name?: string | null,
): number {
  const codeKey = code ? normalizeCode(code) : "";
  const nameKey = name ? normalizeName(name) : "";

  for (let rank = 0; rank < CARD_LEARNING_AREAS.length; rank += 1) {
    const area = CARD_LEARNING_AREAS[rank];
    if (codeKey && area.code?.test(codeKey)) return rank;
    if (nameKey && area.name?.test(nameKey)) return rank;
  }
  return UNRANKED_SUBJECT;
}
