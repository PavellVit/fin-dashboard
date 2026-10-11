// Wasm works with instrument indexes; symbols exist only on the TS side.
// 24 Greek letters + 24 NATO words (ALFA and DELTA are not repeated) + 2 extra = 50
// prettier-ignore
export const SYMBOLS: readonly string[] = [
    'ALFA', 'BETA', 'GAMMA', 'DELTA', 'EPSILON', 'ZETA', 'ETA', 'THETA', 'IOTA', 'KAPPA',
    'LAMBDA', 'MU', 'NU', 'XI', 'OMICRON', 'PI', 'RHO', 'SIGMA', 'TAU', 'UPSILON',
    'PHI', 'CHI', 'PSI', 'OMEGA', 'BRAVO', 'CHARLIE', 'ECHO', 'FOXTROT', 'GOLF', 'HOTEL',
    'INDIA', 'JULIETT', 'KILO', 'LIMA', 'MIKE', 'NOVEMBER', 'OSCAR', 'PAPA', 'QUEBEC', 'ROMEO',
    'SIERRA', 'TANGO', 'UNIFORM', 'VICTOR', 'WHISKEY', 'XRAY', 'YANKEE', 'ZULU', 'ACME', 'ZENITH',
  ];
