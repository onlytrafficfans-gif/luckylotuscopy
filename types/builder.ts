export type AppSectionType =
  | 'hero'
  | 'logoCloud'
  | 'stats'
  | 'features'
  | 'chart'
  | 'activity'
  | 'pricing'
  | 'kanban'
  | 'testimonials'
  | 'faq'
  | 'gallery'
  | 'team'
  | 'table'
  | 'cta';

export type AppSectionItem = {
  title: string;
  value: string;
  description: string;
  meta: string;
  icon: string;
};

export type AppSection = {
  id: string;
  type: AppSectionType;
  eyebrow: string;
  title: string;
  subtitle: string;
  columns: 1 | 2 | 3 | 4;
  items: AppSectionItem[];
};

export type AppSpecification = {
  projectName: string;
  appType: string;
  summary: string;
  theme: {
    mode: 'dark' | 'light';
    accent: string;
    accentSecondary: string;
    background: string;
    surface: string;
    text: string;
    muted: string;
    radius: number;
    personality: 'minimal' | 'editorial' | 'playful' | 'luxury' | 'technical';
  };
  navigation: string[];
  sections: AppSection[];
};

export type VersionSnapshot = {
  id: string;
  timestamp: string;
  prompt: string;
  previousSpecification: AppSpecification;
  updatedSpecification: AppSpecification;
};

export type BuilderProject = {
  id: string;
  updatedAt: string;
  specification: AppSpecification;
  versions: VersionSnapshot[];
};

export type ChatMessage = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
};

export type GenerationResult = {
  specification: AppSpecification;
  summary: string;
  changedSections: string[];
};


