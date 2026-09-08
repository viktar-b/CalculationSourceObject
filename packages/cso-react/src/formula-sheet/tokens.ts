const headerTextClass = "font-['Plus_Jakarta_Sans'] text-[12px] text-black/50";
const valueTextClass = "font-['KaTeX_Main'] text-[16.335px]";

export const FORMULA_SHEET_ROW_BORDER_CLASS = 'border-t border-gray-300';
export const FORMULA_SHEET_SPACER_CELL_CLASS = 'w-[1.5%] p-[3px]';
export const FORMULA_SHEET_DESCRIPTION_CELL_CLASS = `flex w-[37%] flex-col justify-start py-[3px] ${headerTextClass}`;
export const FORMULA_SHEET_COMMENT_CELL_CLASS = `flex w-[23.5%] flex-col justify-start py-[3px] text-right ${headerTextClass}`;
export const FORMULA_SHEET_SYMBOL_CELL_BASE_CLASS =
  'flex w-[14%] min-w-[14%] items-center justify-end overflow-visible border-r border-gray-300';
export const FORMULA_SHEET_SYMBOL_CELL_HEADER_CLASS = `p-[3px] ${headerTextClass}`;
export const FORMULA_SHEET_SYMBOL_CELL_VALUE_CLASS = `p-[3px] pr-[5px] ${valueTextClass}`;
export const FORMULA_SHEET_VALUE_CELL_BASE_CLASS =
  'flex w-[14.5%] items-center justify-end border-r border-gray-300';
export const FORMULA_SHEET_VALUE_CELL_HEADER_CLASS = `p-[3px] ${headerTextClass}`;
export const FORMULA_SHEET_VALUE_CELL_VALUE_CLASS = `p-[3px] ${valueTextClass}`;
export const FORMULA_SHEET_UNIT_CELL_BASE_CLASS =
  'flex w-[9.5%] items-center overflow-hidden';
export const FORMULA_SHEET_UNIT_CELL_HEADER_CLASS = `p-[3px] ${headerTextClass}`;
export const FORMULA_SHEET_UNIT_CELL_VALUE_CLASS = 'p-[5px]';
