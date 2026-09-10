import type { Publication } from '../types.js';

export const nextTier: Record<string, true> = {
  'ase': true,
  'issta': true,
  'icde': true,
  'pods': true,
  'hpca': true,
  'ndss': true,
  'eurosys': true,
  'eurographics': true,
  'fast': true,
  'usenixatc': true,
  'icfp': true,
  'oopsla': true,
  'kdd': true
};

// Map conferences to top-level areas (from csrankings.ts)
export const parentMap: Record<string, string> = {
  'aaai': 'ai', 'ijcai': 'ai',
  'cvpr': 'vision', 'eccv': 'vision', 'iccv': 'vision',
  'icml': 'mlmining', 'iclr': 'mlmining', 'kdd': 'mlmining', 'nips': 'mlmining',
  'acl': 'nlp', 'emnlp': 'nlp', 'naacl': 'nlp',
  'sigir': 'inforet', 'www': 'inforet',
  'asplos': 'arch', 'isca': 'arch', 'micro': 'arch', 'hpca': 'arch',
  'ccs': 'sec', 'oakland': 'sec', 'usenixsec': 'sec', 'ndss': 'sec',
  'vldb': 'mod', 'sigmod': 'mod', 'icde': 'mod', 'pods': 'mod',
  'dac': 'da', 'iccad': 'da',
  'emsoft': 'bed', 'rtas': 'bed', 'rtss': 'bed',
  'sc': 'hpc', 'hpdc': 'hpc', 'ics': 'hpc',
  'mobicom': 'mobile', 'mobisys': 'mobile', 'sensys': 'mobile',
  'imc': 'metrics', 'sigmetrics': 'metrics',
  'osdi': 'ops', 'sosp': 'ops', 'eurosys': 'ops', 'fast': 'ops', 'usenixatc': 'ops',
  'popl': 'plan', 'pldi': 'plan', 'oopsla': 'plan', 'icfp': 'plan',
  'fse': 'soft', 'icse': 'soft', 'ase': 'soft', 'issta': 'soft',
  'nsdi': 'comm', 'sigcomm': 'comm',
  'siggraph': 'graph', 'siggraph-asia': 'graph', 'eurographics': 'graph',
  'focs': 'act', 'soda': 'act', 'stoc': 'act',
  'crypto': 'crypt', 'eurocrypt': 'crypt',
  'cav': 'log', 'lics': 'log',
  'ismb': 'bio', 'recomb': 'bio',
  'ec': 'ecom', 'wine': 'ecom',
  'chiconf': 'chi', 'ubicomp': 'chi', 'uist': 'chi',
  'icra': 'robotics', 'iros': 'robotics', 'rss': 'robotics',
  'vis': 'visualization', 'vr': 'visualization',
  'sigcse': 'csed'
};

// CORE A* conferences
export const coreAStarMap: Record<string, string> = {
  // AI
  'aaai': 'ai', 'ijcai': 'ai', 'aamas': 'ai', 'kr': 'ai', 'icaps': 'ai',
  // ML
  'icml': 'mlmining', 'nips': 'mlmining', 'iclr': 'mlmining', 'kdd': 'mlmining', 'colt': 'mlmining', 'icdm': 'mlmining',
  // CV
  'cvpr': 'vision', 'iccv': 'vision', 'eccv': 'vision',
  // NLP
  'acl': 'nlp', 'emnlp': 'nlp',
  // Security
  'oakland': 'sec', 'usenixsec': 'sec', 'ccs': 'sec', 'ndss': 'sec',
  // Systems & Architecture
  'osdi': 'ops', 'sosp': 'ops', 'isca': 'arch', 'asplos': 'arch', 'hpca': 'arch',
  // Theory & Logic
  'stoc': 'act', 'focs': 'act', 'soda': 'act', 'cav': 'log', 'lics': 'log', 'podc': 'act',
  // HCI
  'chiconf': 'chi', 'uist': 'chi',
  // Networks
  'sigcomm': 'comm', 'infocom': 'comm', 'sensys': 'mobile', 'mobicom': 'mobile', 'percom': 'mobile', 'ipsn': 'mobile',
  // Graphics & Multimedia
  'siggraph': 'graph', 'siggraph-asia': 'graph', 'acmmm': 'graph', 'vr': 'graph', 'ismar': 'graph',
  // SE
  'icse': 'soft', 'fse': 'soft', 'ase': 'soft',
  // PL
  'popl': 'plan', 'pldi': 'plan',
  // Databases / Info Retrieval
  'sigmod': 'mod', 'vldb': 'mod', 'icde': 'mod', 'pods': 'mod', 'sigir': 'inforet', 'www': 'inforet',
  // Measurement / Performance
  'sigmetrics': 'metrics',
  // RT
  'rtss': 'bed',
  // Economics
  'ec': 'ecom'
};

// CORE A venues must map to a CSRankings research area. Using booleans here
// caused venue identifiers such as "pets" to leak into charts as fake areas.
export const coreAMap: Record<string, string> = {
  'acsac': 'sec', 'aied': 'csed', 'aistats': 'mlmining', 'alenex': 'act', 'asiacrypt': 'crypt', 'assets': 'chi',
  'bmvc': 'vision', 'bpm': 'soft', 'cade': 'log', 'caise': 'soft', 'ccc': 'act', 'cgo': 'arch', 'ches': 'crypt',
  'cidr': 'mod', 'cikm': 'inforet', 'conext': 'comm', 'cp': 'act', 'cscw': 'chi', 'csf': 'sec', 'dis': 'chi',
  'disc': 'act', 'dsn': 'ops', 'eacl': 'nlp', 'ease': 'soft', 'ecai': 'ai', 'ecir': 'inforet', 'ecoop': 'plan',
  'er': 'mod', 'esa': 'act', 'esem': 'soft', 'esop': 'plan', 'esorics': 'sec', 'eurosys': 'ops', 'fast': 'ops',
  'fc': 'crypt', 'foga': 'ai', 'fpga': 'da', 'gd': 'visualization', 'gecco': 'ai', 'hotos': 'ops', 'hpdc': 'hpc',
  'iccad': 'da', 'icdar': 'vision', 'icdcs': 'ops', 'icdt': 'mod', 'icer': 'csed', 'icfp': 'plan', 'icme': 'graph',
  'ics': 'hpc', 'icsa': 'soft', 'icsoc': 'soft', 'icws': 'soft', 'icwsm': 'inforet', 'ijcar': 'log', 'imc': 'metrics',
  'interspeech': 'nlp', 'ipdps': 'hpc', 'iros': 'robotics', 'islped': 'da', 'ismb': 'bio', 'issre': 'soft',
  'issta': 'soft', 'iswc': 'inforet', 'itc': 'da', 'itcs': 'act', 'iui': 'chi', 'lak': 'csed', 'miccai': 'vision',
  'middleware': 'ops', 'mmsys': 'graph', 'msr': 'soft', 'naacl': 'nlp', 'oopsla': 'plan', 'pets': 'sec',
  'ppsn': 'ai', 're': 'soft', 'recsys': 'inforet', 'rtas': 'bed', 'rtss': 'bed', 'sat': 'log', 'sdm': 'mlmining',
  'seams': 'soft', 'sigcse': 'csed', 'sigspatial': 'mod', 'soups': 'sec', 'stacs': 'act', 'tacas': 'log',
  'uai': 'ai', 'usenixatc': 'ops', 'wacv': 'vision', 'wsdm': 'inforet'
};

export const CONFERENCE_SET_IDS = ['csrankings-default', 'csrankings', 'core', 'core-a', 'all-union'] as const;
export type ConferenceSetId = typeof CONFERENCE_SET_IDS[number];

export function normalizeConferenceSet(confSet: string): ConferenceSetId {
  return (CONFERENCE_SET_IDS as readonly string[]).includes(confSet)
    ? confSet as ConferenceSetId
    : 'all-union';
}

export function publicationMatchesConferenceSet(publication: Pick<Publication, 'area'>, confSet = 'all-union') {
  const selectedSet = normalizeConferenceSet(confSet);
  if (selectedSet === 'core') return Boolean(coreAStarMap[publication.area]);
  if (selectedSet === 'core-a') return Boolean(coreAStarMap[publication.area] || coreAMap[publication.area]);
  if (selectedSet === 'all-union') {
    return Boolean(parentMap[publication.area] || coreAStarMap[publication.area] || coreAMap[publication.area]);
  }
  // Upstream scrapes venues it never assigns to an area (PoPETs, for example);
  // CSRankings itself counts none of them, so neither set may include one.
  if (!parentMap[publication.area]) return false;
  if (selectedSet === 'csrankings-default') return !nextTier[publication.area];
  return true;
}

export function getConferenceAreaMap(confSet = 'all-union'): Record<string, string> {
  const selectedSet = normalizeConferenceSet(confSet);
  if (selectedSet === 'core' || selectedSet === 'core-a' || selectedSet === 'all-union') {
    // CORE occasionally categorizes a venue differently from CSRankings, so
    // CORE's mapping must win when both contain the venue.
    return selectedSet === 'core'
      ? { ...parentMap, ...coreAStarMap }
      : { ...parentMap, ...coreAStarMap, ...coreAMap };
  }
  return parentMap;
}

// Get unique top-level areas
export const topLevelAreas = [...new Set(Object.values(parentMap))];
export const numAreas = topLevelAreas.length;
