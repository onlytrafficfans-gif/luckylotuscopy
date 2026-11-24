import {
  AppSection,
  AppSectionItem,
  AppSectionType,
  AppSpecification,
  GenerationResult,
} from '../types/builder';

export const supportedSectionTypes: AppSectionType[] = [
  'hero',
  'logoCloud',
  'stats',
  'features',
  'chart',
  'activity',
  'pricing',
  'kanban',
  'testimonials',
  'faq',
  'gallery',
  'team',
  'table',
  'cta',
];

const item = (
  title: string,
  value = '',
  description = '',
  meta = '',
  icon = 'sparkles',
): AppSectionItem => ({ title, value, description, meta, icon });

export const starterSpecification: AppSpecification = {
  projectName: 'Arc Studio',
  appType: 'creative analytics workspace',
  summary: 'A premium command center for modern product teams.',
  theme: {
    mode: 'dark',
    accent: '#A3FF6F',
    accentSecondary: '#7C6CFF',
    background: '#080A0C',
    surface: '#12151A',
    text: '#F7F8FA',
    muted: '#8A929E',
    radius: 22,
    personality: 'technical',
  },
  navigation: ['Overview', 'Projects', 'Insights', 'Automations'],
  sections: [
    {
      id: 'hero-primary',
      type: 'hero',
      eyebrow: 'INTELLIGENT WORKSPACE',
      title: 'Turn product signals into your next best move.',
      subtitle: 'One beautifully focused place to understand momentum, unblock teams, and ship with confidence.',
      columns: 1,
      items: [
        item('Start a project', 'Primary action', 'Create a focused workspace in seconds.', '', 'arrowUpRight'),
        item('Watch overview', 'Secondary action', 'See the complete product workflow.', '2 min', 'play'),
      ],
    },
    {
      id: 'stats-primary',
      type: 'stats',
      eyebrow: 'LIVE SIGNALS',
      title: 'Momentum at a glance',
      subtitle: 'The metrics your team needs, without the noise.',
      columns: 4,
      items: [
        item('Active projects', '24', 'Across six product squads', '+12%', 'layers'),
        item('Weekly velocity', '86%', 'Ahead of the quarterly baseline', '+8%', 'activity'),
        item('Customer signal', '9.2', 'Weighted satisfaction score', '+0.6', 'heart'),
        item('Time saved', '148h', 'Automated this month', '+21%', 'clock'),
      ],
    },
    {
      id: 'chart-primary',
      type: 'chart',
      eyebrow: 'PERFORMANCE',
      title: 'Growth that compounds',
      subtitle: 'A clear view of adoption and retention over the last six months.',
      columns: 1,
      items: [
        item('Jan', '32', '', '', 'bar'),
        item('Feb', '48', '', '', 'bar'),
        item('Mar', '41', '', '', 'bar'),
        item('Apr', '67', '', '', 'bar'),
        item('May', '76', '', '', 'bar'),
        item('Jun', '94', '', '', 'bar'),
      ],
    },
    {
      id: 'activity-primary',
      type: 'activity',
      eyebrow: 'IN MOTION',
      title: 'Recent activity',
      subtitle: 'Everything moving across your workspace right now.',
      columns: 1,
      items: [
        item('Homepage experiment shipped', '', 'Maya moved the new onboarding flow to production.', '4m ago', 'check'),
        item('Research synthesis ready', '', 'Eight interviews were distilled into four opportunities.', '24m ago', 'sparkles'),
        item('Milestone reached', '', 'The mobile team crossed 10,000 weekly active users.', '1h ago', 'trophy'),
      ],
    },
  ],
};

const isHex = (value: unknown): value is string =>
  typeof value === 'string' && /^#[0-9A-F]{6}$/i.test(value);

const isString = (value: unknown, max = 240): value is string =>
  typeof value === 'string' && value.length <= max;

function validateItem(value: unknown): value is AppSectionItem {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<AppSectionItem>;
  return (
    isString(candidate.title, 80) &&
    isString(candidate.value, 80) &&
    isString(candidate.description, 180) &&
    isString(candidate.meta, 80) &&
    isString(candidate.icon, 40)
  );
}

function validateSection(value: unknown): value is AppSection {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<AppSection>;
  return (
    isString(candidate.id, 80) &&
    supportedSectionTypes.includes(candidate.type as AppSectionType) &&
    isString(candidate.eyebrow, 60) &&
    isString(candidate.title, 100) &&
    isString(candidate.subtitle, 240) &&
    [1, 2, 3, 4].includes(candidate.columns as number) &&
    Array.isArray(candidate.items) &&
    candidate.items.length <= 12 &&
    candidate.items.every(validateItem)
  );
}

export function validateSpecification(value: unknown): AppSpecification {
  if (!value || typeof value !== 'object') throw new Error('The model returned an invalid specification.');
  const spec = value as Partial<AppSpecification>;
  const theme = spec.theme;
  if (
    !isString(spec.projectName, 60) ||
    !isString(spec.appType, 80) ||
    !isString(spec.summary, 240) ||
    !theme ||
    !['dark', 'light'].includes(theme.mode) ||
    !isHex(theme.accent) ||
    !isHex(theme.accentSecondary) ||
    !isHex(theme.background) ||
    !isHex(theme.surface) ||
    !isHex(theme.text) ||
    !isHex(theme.muted) ||
    typeof theme.radius !== 'number' ||
    theme.radius < 0 ||
    theme.radius > 36 ||
    !['minimal', 'editorial', 'playful', 'luxury', 'technical'].includes(theme.personality) ||
    !Array.isArray(spec.navigation) ||
    !spec.navigation.every((entry) => isString(entry, 30)) ||
    !Array.isArray(spec.sections) ||
    spec.sections.length < 2 ||
    spec.sections.length > 10 ||
    !spec.sections.every(validateSection)
  ) {
    throw new Error('The model response did not match the safe Lotus component schema.');
  }
  return spec as AppSpecification;
}

export function validateGenerationResult(value: unknown): GenerationResult {
  if (!value || typeof value !== 'object') throw new Error('The generation response was empty.');
  const result = value as Partial<GenerationResult>;
  if (!isString(result.summary, 240) || !Array.isArray(result.changedSections)) {
    throw new Error('The generation summary was invalid.');
  }
  return {
    specification: validateSpecification(result.specification),
    summary: result.summary,
    changedSections: result.changedSections.filter((entry): entry is string => isString(entry, 80)),
  };
}

export const generationJsonSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['specification', 'summary', 'changedSections'],
  properties: {
    summary: { type: 'string', maxLength: 240 },
    changedSections: { type: 'array', maxItems: 12, items: { type: 'string', maxLength: 80 } },
    specification: {
      type: 'object',
      additionalProperties: false,
      required: ['projectName', 'appType', 'summary', 'theme', 'navigation', 'sections'],
      properties: {
        projectName: { type: 'string', maxLength: 60 },
        appType: { type: 'string', maxLength: 80 },
        summary: { type: 'string', maxLength: 240 },
        theme: {
          type: 'object',
          additionalProperties: false,
          required: [
            'mode',
            'accent',
            'accentSecondary',
            'background',
            'surface',
            'text',
            'muted',
            'radius',
            'personality',
          ],
          properties: {
            mode: { type: 'string', enum: ['dark', 'light'] },
            accent: { type: 'string', pattern: '^#[0-9A-Fa-f]{6}$' },
            accentSecondary: { type: 'string', pattern: '^#[0-9A-Fa-f]{6}$' },
            background: { type: 'string', pattern: '^#[0-9A-Fa-f]{6}$' },
            surface: { type: 'string', pattern: '^#[0-9A-Fa-f]{6}$' },
            text: { type: 'string', pattern: '^#[0-9A-Fa-f]{6}$' },
            muted: { type: 'string', pattern: '^#[0-9A-Fa-f]{6}$' },
            radius: { type: 'number', minimum: 0, maximum: 36 },
            personality: {
              type: 'string',
              enum: ['minimal', 'editorial', 'playful', 'luxury', 'technical'],
            },
          },
        },
        navigation: {
          type: 'array',
          minItems: 2,
          maxItems: 7,
          items: { type: 'string', maxLength: 30 },
        },
        sections: {
          type: 'array',
          minItems: 2,
          maxItems: 10,
          items: {
            type: 'object',
            additionalProperties: false,
            required: ['id', 'type', 'eyebrow', 'title', 'subtitle', 'columns', 'items'],
            properties: {
              id: { type: 'string', maxLength: 80 },
              type: { type: 'string', enum: supportedSectionTypes },
              eyebrow: { type: 'string', maxLength: 60 },
              title: { type: 'string', maxLength: 100 },
              subtitle: { type: 'string', maxLength: 240 },
              columns: { type: 'integer', enum: [1, 2, 3, 4] },
              items: {
                type: 'array',
                maxItems: 12,
                items: {
                  type: 'object',
                  additionalProperties: false,
                  required: ['title', 'value', 'description', 'meta', 'icon'],
                  properties: {
                    title: { type: 'string', maxLength: 80 },
                    value: { type: 'string', maxLength: 80 },
                    description: { type: 'string', maxLength: 180 },
                    meta: { type: 'string', maxLength: 80 },
                    icon: { type: 'string', maxLength: 40 },
                  },
                },
              },
            },
          },
        },
      },
    },
  },
} as const;


