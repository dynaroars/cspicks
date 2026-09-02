export type StringMap<T> = Record<string, T>;

export interface Publication {
  area: string;
  year: number;
  count: number;
  adjustedcount: number;
}

export interface AreaStats {
  count: number;
  adjusted: number;
}

export interface SchoolAreaStats extends AreaStats {
  faculty: string[];
  facultyStats: StringMap<AreaStats>;
}

export interface Professor {
  name: string;
  affiliation: string;
  homepage?: string;
  scholarid?: string;
  orcid: string | null;
  aliases: string[];
  unitNotes: string[];
  turingAwardYear: number | null;
  acmFellowYear: number | null;
  pubs: Publication[];
}

export interface FilteredProfessor extends Professor {
  areas: StringMap<AreaStats>;
  totalCount: number;
  totalAdjusted: number;
  totalPapers: number;
  rank?: number;
}

export interface School {
  name: string;
  areas: StringMap<SchoolAreaStats>;
  region: string | null;
  country: string | null;
  countryName?: string;
  homepage?: string | null;
}

export interface FilteredSchool extends School {
  areaAdjustedCounts: StringMap<number>;
  facultyAdjustedCounts: StringMap<number>;
  facultyCounts: StringMap<number>;
  totalCount: number;
  totalAdjusted: number;
  score?: number;
  rank?: number;
  areaRanks?: StringMap<number>;
  perCapitaScore?: number;
  perCapitaRank?: number;
}

export interface RawData {
  professors: StringMap<Professor>;
  schools: StringMap<School>;
}

export interface FilteredData {
  professors: StringMap<FilteredProfessor>;
  schools: StringMap<FilteredSchool>;
}

export interface AffiliationSegment {
  school: string;
  start: number;
  end: number;
}

export type AffiliationHistory = StringMap<AffiliationSegment[]>;
export type SchoolAliasMap = StringMap<string>;

export interface ManualAffiliationRow {
  name?: string;
  school?: string;
  start?: string;
  end?: string;
}

export interface CsrankingsFacultyRow {
  name?: string;
  affiliation?: string;
  homepage?: string;
  scholarid?: string;
  orcid?: string;
}

export interface PublicationRow {
  name?: string;
  year?: string;
  area?: string;
  count?: string;
  adjustedcount?: string;
}

export interface InstitutionRow {
  institution?: string;
  region?: string;
  countryabbrv?: string;
  homepage?: string;
}

export interface CountryRow {
  alpha_2?: string;
  name?: string;
}

export interface HonorRow {
  name?: string;
  year?: string;
}

export interface DblpAliasRow {
  alias?: string;
  name?: string;
}

export interface NameChangeRow {
  old_name?: string;
  new_name?: string;
  orcid?: string;
}

export interface NsfInvestigator {
  name: string;
  role: string;
  facultyName: string | null;
  rosterName: string | null;
  affiliation: string | null;
}

export interface NsfAward {
  id: string;
  title: string;
  awardee: string;
  awardDate: string;
  startDate: string;
  endDate: string;
  obligatedAmount: number;
  estimatedAmount: number;
  directorate: string;
  division: string;
  program: string;
  programManager: string;
  active: boolean;
  investigators: NsfInvestigator[];
  collaborativeTotalAmount?: number;
  collaborativeAwardCount?: number;
}

export interface NsfDataset {
  awards: NsfAward[];
  schemaVersion?: number;
  source?: string;
  sourceUrl?: string;
  scope?: string[];
  coverage?: {
    complete?: boolean;
    failures?: number;
    institutionsChecked?: number;
    institutionsTotal?: number;
    facultyChecked?: number;
    facultyTotal?: number;
  };
  methodology?: unknown;
  syncedAt?: string;
  rosterNamesSyncedAt?: string;
}

export interface AttributedNsfAward extends NsfAward {
  role?: string;
  attributedAmount: number;
}

export interface FundingFaculty {
  name: string;
  affiliation: string | null;
  awards: AttributedNsfAward[];
  attributedAmount: number;
  totalAwardAmount: number;
}

export interface FundingSchool {
  name: string;
  awards: AttributedNsfAward[];
  faculty: string[];
  attributedAmount: number;
}

export interface FundingIndex {
  awards: NsfAward[];
  faculty: FundingFaculty[];
  facultyByName: Map<string, FundingFaculty>;
  facultyByNormalizedName: Map<string, FundingFaculty | null>;
  schools: FundingSchool[];
}

export interface Grant {
  id: string;
  name: string;
  shortName: string;
  sponsor: string;
  sponsorCategory: string;
  targetAudience: string[];
  whoFor: string;
  deadline: string;
  deadlineMonth: number;
  amount: string;
  summary: string;
  eligibility: string[];
  topics: string[];
  url: string;
  featured?: boolean;
  status?: 'historical' | string;
  locations?: string[];
  locationLabel?: string;
}
