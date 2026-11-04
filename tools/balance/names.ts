import { defaultContent } from '@core/content/default';

export const unitLabelEs = (t: number): string => defaultContent().files.units[t]?.name.es ?? String(t);
