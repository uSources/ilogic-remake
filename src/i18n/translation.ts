/**
 * Forma de una traduccion: las mismas claves que el texto en castellano, ni una mas ni una menos.
 * Asi una traduccion que falta (o una clave mal escrita) no compila.
 */
export type Translation<Spanish> = { readonly [Key in keyof Spanish]: string };
