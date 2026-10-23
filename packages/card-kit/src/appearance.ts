import * as z from 'zod';

// Only validated paint values enter SVG attributes; arbitrary CSS/markup is not accepted.
export const paint = z
  .string()
  .regex(/^(?:#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})|transparent)$/);
export const surfaceParams = {
  title: z.string().max(160).optional().describe('自定义标题'),
  width: z.number().int().min(300).max(1200).optional().describe('卡片宽度'),
  'hide-title': z.boolean().optional().describe('隐藏标题'),
  'hide-border': z.boolean().optional().describe('隐藏边框'),
  'border-radius': z.number().min(0).max(40).optional().describe('边角半径'),
  'title-color': paint.optional().describe('标题颜色'),
  'text-color': paint.optional().describe('文字颜色'),
  'background-color': paint.optional().describe('背景颜色'),
  'border-color': paint.optional().describe('边框颜色'),
};
export const appearanceParams = {
  ...surfaceParams,
  'icon-color': paint.optional().describe('图标颜色'),
  'number-format': z.enum(['short', 'long']).optional().describe('数字格式'),
  'number-precision': z.number().int().min(0).max(2).optional().describe('数字小数位'),
  'line-height': z.number().min(22).max(48).optional().describe('行高'),
  'show-icons': z.boolean().optional().describe('显示指标图标'),
  'text-bold': z.boolean().optional().describe('加粗指标文字'),
  animate: z.boolean().optional().describe('启用 SVG 入场动画'),
};
