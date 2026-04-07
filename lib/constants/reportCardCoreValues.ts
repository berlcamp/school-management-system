import type {
  CoreValueRating,
  CoreValuesData,
} from "@/lib/pdf/generateReportCard";

export const DEFAULT_CORE_VALUES: CoreValuesData = {
  makaDiyos1: ["", "", "", ""],
  makaDiyos2: ["", "", "", ""],
  makatao1: ["", "", "", ""],
  makatao2: ["", "", "", ""],
  makakalikasan1: ["", "", "", ""],
  makabansa1: ["", "", "", ""],
  makabansa2: ["", "", "", ""],
};

export const RATING_OPTIONS: CoreValueRating[] = ["", "AO", "SO", "RO", "NO"];

export const CORE_VALUE_STATEMENTS = [
  {
    key: "makaDiyos1" as const,
    coreValue: "Maka-Diyos",
    statement:
      "Expresses one's spiritual beliefs while respecting the spiritual beliefs of others",
  },
  {
    key: "makaDiyos2" as const,
    coreValue: "Maka-Diyos",
    statement:
      "Shows adherence to ethical principles by upholding truth",
  },
  {
    key: "makatao1" as const,
    coreValue: "Makatao",
    statement:
      "Is sensitive to individual, social and cultural differences",
  },
  {
    key: "makatao2" as const,
    coreValue: "Makatao",
    statement: "Demonstrates contributions toward solidarity",
  },
  {
    key: "makakalikasan1" as const,
    coreValue: "Maka-kalikasan",
    statement:
      "Cares for the environment and utilizes resources wisely",
  },
  {
    key: "makabansa1" as const,
    coreValue: "Makabansa",
    statement:
      "Demonstrates pride in being a Filipino; exercises the rights and responsibilities of a Filipino citizen",
  },
  {
    key: "makabansa2" as const,
    coreValue: "Makabansa",
    statement:
      "Demonstrates appropriate behavior in carrying out activities in the school, community and country",
  },
] as const;
