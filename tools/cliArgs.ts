/**
 * Las opciones de la linea de ordenes de las herramientas (`npm run fuzz -- --games 50`), sobre
 * `parseArgs` de Node. Cada herramienta dice que opciones tiene y de que clase son; una opcion que no
 * conoce o un numero que no lo es paran antes de empezar, en vez de jugar 200 partidas con el valor
 * por defecto porque se escribio `--gmes`.
 *
 *   const args = commandLine(import.meta.url, { games: 'number', name: 'text', set: 'texts', fog: 'flag' });
 *   args.number('games', 200); args.text('name'); args.texts('set'); args.flag('fog');
 *
 * Un valor que empieza por guion va con `=`: `--seed=-5`.
 */
import { readFileSync } from 'node:fs';
import { parseArgs, type ParseArgsConfig } from 'node:util';

/** Que lleva una opcion: un numero, un texto, varios textos (la opcion repetida) o nada (`--x`/`--no-x`). */
export type OptionKind = 'number' | 'text' | 'texts' | 'flag';

/** Una opcion: su clase y, si la tiene, su letra (`-e`). */
export type OptionSpec = OptionKind | { kind: OptionKind; short: string };

/** Las opciones de una herramienta, por su nombre largo (sin `--`). */
export type OptionsSpec = Readonly<Record<string, OptionSpec>>;

type KindOf<Spec extends OptionSpec> = Spec extends { kind: infer Kind } ? Kind : Spec;

/** Los nombres de las opciones de una clase. */
type NamesOf<Spec extends OptionsSpec, Kind extends OptionKind> = {
  [Name in keyof Spec]: KindOf<Spec[Name]> extends Kind ? Name : never;
}[keyof Spec] &
  string;

/** Lo que se ha escrito, ya leido: cada opcion con el tipo de su clase. */
export interface CliArgs<Spec extends OptionsSpec> {
  /** Lo que no es una opcion, en orden (la orden de `balance`, los informes de `compare`...). */
  readonly positionals: readonly string[];
  number(name: NamesOf<Spec, 'number'>, fallback: number): number;
  number(name: NamesOf<Spec, 'number'>): number | undefined;
  text(name: NamesOf<Spec, 'text'>, fallback: string): string;
  text(name: NamesOf<Spec, 'text'>): string | undefined;
  /** Todas las veces que se ha escrito, en orden (ninguna: lista vacia). */
  texts(name: NamesOf<Spec, 'texts'>): readonly string[];
  /** true con `--name`, false con `--no-name` y undefined si no sale. */
  flag(name: NamesOf<Spec, 'flag'>): boolean | undefined;
}

const kindOf = (option: OptionSpec): OptionKind => (typeof option === 'string' ? option : option.kind);

/** Como se lo pide a `parseArgs`: los numeros llegan como texto y se comprueban aqui. */
function parseOption(option: OptionSpec): NonNullable<ParseArgsConfig['options']>[string] {
  const kind = kindOf(option);
  const short = typeof option === 'string' ? {} : { short: option.short };
  if (kind === 'flag') return { type: 'boolean', ...short };
  return { type: 'string', multiple: kind === 'texts', ...short };
}

function toNumber(name: string, text: string): number {
  const value = Number(text);
  if (text.trim() === '' || !Number.isFinite(value)) throw new Error(`--${name} tiene que ser un numero (pone "${text}")`);
  return value;
}

/** Lee `argv` (sin `node` ni el script) con las opciones de `spec`; falla con lo que no encaje. */
export function cliArgs<const Spec extends OptionsSpec>(argv: readonly string[], spec: Spec): CliArgs<Spec> {
  const options = Object.fromEntries(Object.entries(spec).map(([name, option]) => [name, parseOption(option)]));
  const { values, positionals } = parseArgs({ args: [...argv], options, allowPositionals: true, allowNegative: true, strict: true });
  for (const [name, option] of Object.entries(spec)) {
    const value = values[name];
    if (kindOf(option) === 'number' && typeof value === 'string') toNumber(name, value);
  }
  const text = (name: string): string | undefined => values[name] as string | undefined;
  return {
    positionals,
    number: ((name: string, fallback?: number) => {
      const value = text(name);
      return value === undefined ? fallback : toNumber(name, value);
    }) as CliArgs<Spec>['number'],
    text: ((name: string, fallback?: string) => text(name) ?? fallback) as CliArgs<Spec>['text'],
    texts: (name) => (values[name] as string[] | undefined) ?? [],
    flag: (name) => values[name] as boolean | undefined,
  };
}

/** Como se usa una herramienta: el comentario con el que empieza su fichero (`import.meta.url`), sin los ` * `. */
export function usageOf(script: string): string {
  const header = readFileSync(new URL(script), 'utf8').split('*/')[0]!.replace('/**', '');
  return header
    .split('\n')
    .map((line) => line.replace(/^\s*\* ?/, ''))
    .join('\n')
    .trim();
}

/**
 * Las opciones con las que se ha llamado a la herramienta del fichero `script` (`import.meta.url`).
 * Si algo no encaja, lo dice, recuerda como se usa (`usageOf`) y sale con error.
 */
export function commandLine<const Spec extends OptionsSpec>(script: string, spec: Spec): CliArgs<Spec> {
  try {
    return cliArgs(process.argv.slice(2), spec);
  } catch (error) {
    console.error(`${error instanceof Error ? error.message : String(error)}\n\n${usageOf(script)}`);
    process.exit(2);
  }
}
