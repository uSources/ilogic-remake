import { CONTENT } from '@core/data';

export const unitLabelEs = (t: number): string => CONTENT.units[t]?.name.es ?? String(t);
