const presentationEquivalentAlphabets = [
  ['𝐴𝐵𝐶𝐷𝐸𝐹𝐺𝐻𝐼𝐽𝐾𝐿𝑀𝑁𝑂𝑃𝑄𝑅𝑆𝑇𝑈𝑉𝑊𝑋𝑌𝑍', 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'],
  ['𝑎𝑏𝑐𝑑𝑒𝑓𝑔ℎ𝑖𝑗𝑘𝑙𝑚𝑛𝑜𝑝𝑞𝑟𝑠𝑡𝑢𝑣𝑤𝑥𝑦𝑧', 'abcdefghijklmnopqrstuvwxyz'],
  ['𝚤𝚥', 'ıȷ'],
  ['𝛢𝛣𝛤𝛥𝛦𝛧𝛨𝛩𝛪𝛫𝛬𝛭𝛮𝛯𝛰𝛱𝛲𝛳𝛴𝛵𝛶𝛷𝛸𝛹𝛺', 'ΑΒΓΔΕΖΗΘΙΚΛΜΝΞΟΠΡϴΣΤΥΦΧΨΩ'],
  ['𝛼𝛽𝛾𝛿𝜀𝜁𝜂𝜃𝜄𝜅𝜆𝜇𝜈𝜉𝜊𝜋𝜌𝜍𝜎𝜏𝜐𝜑𝜒𝜓𝜔', 'αβγδεζηθικλμνξοπρςστυφχψω'],
  ['𝜖𝜗𝜘𝜙𝜚𝜛', 'ϵϑϰϕϱϖ'],
] as const;

export const presentationEquivalentIdentifiers = new Map<string, string>();
for (const [styled, plain] of presentationEquivalentAlphabets) {
  const plainScalars = [...plain];
  for (const [index, scalar] of [...styled].entries()) {
    const equivalent = plainScalars[index];
    if (equivalent !== undefined)
      presentationEquivalentIdentifiers.set(scalar, equivalent);
  }
}

const supportedGreekIdentifiers = new Set([
  ...'ΑΒΓΔΕΖΗΘΙΚΛΜΝΞΟΠΡΣΤΥΦΧΨΩ',
  ...'αβγδεζηθικλμνξοπρςστυφχψω',
  ...'ɛϴϵϑϰϕϱϖ',
]);

export const isExplicitNotationIdentifierScalar = (value: string): boolean =>
  supportedGreekIdentifiers.has(value) ||
  presentationEquivalentIdentifiers.has(value);
