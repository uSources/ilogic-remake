/**
 * Las funciones exportadas del nucleo que cambian la partida, buscadas en el codigo con el comprobador
 * de tipos de TypeScript (para tests/lintImports.test.ts: que la lista APPLY_STEPS no se quede atras).
 *
 * Una funcion cambia la partida si escribe en algo de la partida: un campo declarado en un tipo de
 * `core/model/` o cualquier cosa de un objeto de esos tipos (un parametro `unit: Unit`, una variable
 * que guarda un campo, `units.length = 0`), asignando, con `++`, `delete`, `push`/`splice`/`set`...,
 * o con `Object.assign`, `Object.defineProperty`, `Reflect.set`... sobre el; si llama a otra que la
 * cambia; o si le pasa un trozo de la partida (un objeto, no la partida entera) a una funcion que no
 * se sabe cual es (un gancho, una tabla). Es una busqueda prudente: no ve lo que no se puede seguir
 * sin ejecutar, pero si todo lo que se escribe directamente o pasando por otras funciones del nucleo.
 * tests/stateWriterKinds.ts tiene un ejemplo de cada forma de escribir (lo prueba lintImports.test.ts).
 */
import ts from 'typescript';
import { resolve } from 'node:path';

const MODEL_FOLDER = '/src/core/model/';
/** Los tipos de core/model que son valores (casillas), no trozos de la partida. */
const VALUE_TYPES_FILE = '/src/core/model/geometry.ts';
/** Las funciones que cambian el objeto que se les da primero. */
const MUTATING_FUNCTIONS: Readonly<Record<string, readonly string[]>> = {
  Object: ['assign', 'defineProperty', 'defineProperties', 'setPrototypeOf'],
  Reflect: ['set', 'defineProperty', 'deleteProperty', 'setPrototypeOf'],
};
const MUTATING_METHODS = new Set([
  'push',
  'pop',
  'shift',
  'unshift',
  'splice',
  'sort',
  'reverse',
  'fill',
  'copyWithin',
  'set',
  'delete',
  'clear',
  'add',
]);

/** Una funcion exportada que cambia la partida: su fichero (desde src/) y su nombre. */
export interface StateWriter {
  file: string;
  name: string;
}

interface FunctionEntry {
  name: string;
  file: string;
  exported: boolean;
  declaration: ts.Node;
  body: ts.Node;
}

const isExported = (node: ts.Node): boolean =>
  ts.canHaveModifiers(node) && !!ts.getModifiers(node)?.some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword);

function functionsOf(sourceFile: ts.SourceFile): FunctionEntry[] {
  const found: FunctionEntry[] = [];
  const file = sourceFile.fileName.slice(sourceFile.fileName.indexOf('/src/') + 1);
  sourceFile.forEachChild((node) => {
    if (ts.isFunctionDeclaration(node) && node.name && node.body)
      found.push({ name: node.name.text, file, exported: isExported(node), declaration: node, body: node.body });
    if (!ts.isVariableStatement(node)) return;
    for (const declaration of node.declarationList.declarations) {
      const value = declaration.initializer;
      if (value && (ts.isArrowFunction(value) || ts.isFunctionExpression(value)))
        found.push({ name: declaration.name.getText(), file, exported: isExported(node), declaration, body: value.body });
    }
  });
  return found;
}

const isAssignment = (kind: ts.SyntaxKind): boolean => kind >= ts.SyntaxKind.FirstAssignment && kind <= ts.SyntaxKind.LastAssignment;
const isIncrement = (node: ts.PrefixUnaryExpression | ts.PostfixUnaryExpression): boolean =>
  node.operator === ts.SyntaxKind.PlusPlusToken || node.operator === ts.SyntaxKind.MinusMinusToken;

/** Busca en los ficheros `files` (rutas del proyecto) con la configuracion de tsconfig.json. */
export function stateWriters(files: readonly string[]): StateWriter[] {
  const config = ts.getParsedCommandLineOfConfigFile('tsconfig.json', {}, { ...ts.sys, onUnRecoverableConfigFileDiagnostic: () => {} });
  const roots = files.map((file) => resolve(file));
  const program = ts.createProgram(roots, config?.options ?? {});
  const checker = program.getTypeChecker();
  const functions = program
    .getSourceFiles()
    .filter((sourceFile) => roots.includes(sourceFile.fileName))
    .flatMap(functionsOf);

  const symbolOf = (node: ts.Node): ts.Symbol | undefined => {
    const symbol = checker.getSymbolAtLocation(node);
    return symbol && symbol.flags & ts.SymbolFlags.Alias ? checker.getAliasedSymbol(symbol) : symbol;
  };
  const isInModel = (symbol: ts.Symbol | undefined): boolean =>
    !!symbol?.declarations?.some((declaration) => declaration.getSourceFile().fileName.includes(MODEL_FOLDER));
  const isModelField = (name: ts.Node): boolean => isInModel(symbolOf(name));

  /** Es de core/model y no una casilla (Pos y demas de geometry.ts: valores que se copian, no trozos de la partida). */
  const isStateType = (symbol: ts.Symbol | undefined): boolean =>
    isInModel(symbol) && !symbol!.declarations!.some((declaration) => declaration.getSourceFile().fileName.endsWith(VALUE_TYPES_FILE));

  /** El tipo es uno de la partida (o una lista de ellos, o puede serlo: `Unit | undefined`). */
  const isModelType = (type: ts.Type): boolean => {
    if (type.isUnion()) return type.types.some(isModelType);
    if (checker.isArrayType(type) || checker.isTupleType(type)) return checker.getTypeArguments(type as ts.TypeReference).some(isModelType);
    return isStateType(type.aliasSymbol) || isStateType(type.getSymbol());
  };

  /**
   * `expression` es un trozo de la partida: un campo de un tipo de core/model, un parametro de un tipo
   * de alli (`unit: Unit`, `s: GameState`), o una variable que guarda uno de esos.
   */
  const isStatePart = (expression: ts.Expression, countParameters = true): boolean => {
    const inner = (part: ts.Expression) => isStatePart(part, countParameters);
    if (ts.isNonNullExpression(expression) || ts.isParenthesizedExpression(expression)) return inner(expression.expression);
    if (ts.isPropertyAccessExpression(expression)) return isModelField(expression.name) || inner(expression.expression);
    if (ts.isElementAccessExpression(expression)) return inner(expression.expression);
    if (!ts.isIdentifier(expression)) return false;
    const declaration = symbolOf(expression)?.valueDeclaration;
    if (!declaration) return false;
    // Un parametro de un tipo de la partida es (o puede ser) un trozo de ella; una variable, si guarda uno.
    if (ts.isParameter(declaration)) return countParameters && isModelType(checker.getTypeAtLocation(expression));
    return ts.isVariableDeclaration(declaration) && !!declaration.initializer && inner(declaration.initializer);
  };

  /** `Object.assign(trozo, ...)`, `Reflect.set(trozo, ...)`...: cambia lo que se le da primero. */
  const mutatesArgument = (call: ts.CallExpression): boolean => {
    const callee = call.expression;
    if (!ts.isPropertyAccessExpression(callee) || !ts.isIdentifier(callee.expression)) return false;
    const target = call.arguments[0];
    return !!target && !!MUTATING_FUNCTIONS[callee.expression.text]?.includes(callee.name.text) && isStatePart(target);
  };

  const writers = new Set<ts.Node>();
  const callsWriter = (call: ts.CallExpression): boolean => {
    const callee = ts.isPropertyAccessExpression(call.expression) ? call.expression.name : call.expression;
    return symbolOf(callee)?.declarations?.some((declaration) => writers.has(declaration)) ?? false;
  };
  /** Le pasa un trozo de la partida (un objeto) a una funcion que es un valor: un gancho o una entrada de una tabla. */
  const handsStateToUnknown = (call: ts.CallExpression): boolean => {
    const callee = ts.isPropertyAccessExpression(call.expression) ? call.expression.name : call.expression;
    const declarations = symbolOf(callee)?.declarations ?? [];
    const ours = declarations.every((declaration) => declaration.getSourceFile().fileName.includes('/src/'));
    const known = declarations.some(
      (declaration) =>
        (ts.isFunctionLike(declaration) && 'body' in declaration && !!declaration.body) ||
        (ts.isVariableDeclaration(declaration) && !!declaration.initializer && ts.isFunctionLike(declaration.initializer)),
    );
    const isObject = (argument: ts.Expression) => (checker.getTypeAtLocation(argument).flags & ts.TypeFlags.Object) !== 0;
    // Pasar una casilla o una unidad que llega como parametro a un gancho es lo normal al preguntar: solo
    // cuenta un trozo sacado de la partida (`teamState(s, t).stats`).
    return ours && !known && call.arguments.some((argument) => isStatePart(argument, false) && isObject(argument));
  };

  const writes = (body: ts.Node): boolean => {
    let found = false;
    const visit = (node: ts.Node): void => {
      if (found) return;
      if (ts.isBinaryExpression(node) && isAssignment(node.operatorToken.kind) && !ts.isIdentifier(node.left))
        found = isStatePart(node.left);
      else if ((ts.isPrefixUnaryExpression(node) || ts.isPostfixUnaryExpression(node)) && isIncrement(node))
        found = !ts.isIdentifier(node.operand) && isStatePart(node.operand);
      else if (ts.isDeleteExpression(node)) found = isStatePart(node.expression);
      else if (ts.isCallExpression(node)) {
        const method = ts.isPropertyAccessExpression(node.expression) ? node.expression : null;
        found =
          (!!method && MUTATING_METHODS.has(method.name.text) && isStatePart(method.expression)) ||
          mutatesArgument(node) ||
          callsWriter(node) ||
          handsStateToUnknown(node);
      }
      if (!found) ts.forEachChild(node, visit);
    };
    visit(body);
    return found;
  };

  for (let changed = true; changed;) {
    changed = false;
    for (const entry of functions)
      if (!writers.has(entry.declaration) && writes(entry.body)) {
        writers.add(entry.declaration);
        changed = true;
      }
  }
  return functions.filter((entry) => entry.exported && writers.has(entry.declaration)).map(({ file, name }) => ({ file, name }));
}
