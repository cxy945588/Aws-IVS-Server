/**
 * API 回應格式標準化工具
 *
 * 確保所有 API 端點使用一致的回應格式
 *
 * 創建日期: 2025-10-21
 */

import { Response } from 'express';
import { HTTP_STATUS } from './constants';

/**
 * 標準成功回應介面
 */
export interface SuccessResponse<T = any> {
  success: true;
  data: T;
  timestamp: string;
  message?: string;
}

/**
 * 標準錯誤回應介面
 */
export interface ErrorResponse {
  success: false;
  error: {
    code: string;
    message: string;
    details?: any;
  };
  timestamp: string;
}

/**
 * 發送標準成功回應
 *
 * @param res - Express Response 物件
 * @param data - 回應資料
 * @param statusCode - HTTP 狀態碼（預設 200）
 * @param message - 可選的成功訊息
 */
export function sendSuccess<T>(
  res: Response,
  data: T,
  statusCode: number = HTTP_STATUS.OK,
  message?: string
): void {
  const response: SuccessResponse<T> = {
    success: true,
    data,
    timestamp: new Date().toISOString(),
  };

  if (message) {
    response.message = message;
  }

  res.status(statusCode).json(response);
}

/**
 * 發送標準錯誤回應
 *
 * @param res - Express Response 物件
 * @param errorCode - 錯誤代碼
 * @param message - 錯誤訊息
 * @param statusCode - HTTP 狀態碼（預設 500）
 * @param details - 可選的詳細錯誤資訊（僅開發環境）
 */
export function sendError(
  res: Response,
  errorCode: string,
  message: string,
  statusCode: number = HTTP_STATUS.INTERNAL_SERVER_ERROR,
  details?: any
): void {
  const response: ErrorResponse = {
    success: false,
    error: {
      code: errorCode,
      message,
    },
    timestamp: new Date().toISOString(),
  };

  // 只在開發環境下返回詳細錯誤
  if (details && process.env.NODE_ENV === 'development') {
    response.error.details = details;
  }

  res.status(statusCode).json(response);
}

/**
 * 發送驗證錯誤回應
 *
 * @param res - Express Response 物件
 * @param message - 錯誤訊息
 * @param missingFields - 缺少的欄位列表
 */
export function sendValidationError(
  res: Response,
  message: string,
  missingFields?: string[]
): void {
  const details = missingFields
    ? { missingFields }
    : undefined;

  sendError(
    res,
    'VALIDATION_ERROR',
    message,
    HTTP_STATUS.BAD_REQUEST,
    details
  );
}

/**
 * 發送未授權錯誤回應
 *
 * @param res - Express Response 物件
 * @param message - 錯誤訊息（預設「未授權」）
 */
export function sendUnauthorized(
  res: Response,
  message: string = '未授權'
): void {
  sendError(
    res,
    'UNAUTHORIZED',
    message,
    HTTP_STATUS.UNAUTHORIZED
  );
}

/**
 * 發送禁止訪問錯誤回應
 *
 * @param res - Express Response 物件
 * @param message - 錯誤訊息（預設「無權訪問」）
 */
export function sendForbidden(
  res: Response,
  message: string = '無權訪問'
): void {
  sendError(
    res,
    'FORBIDDEN',
    message,
    HTTP_STATUS.FORBIDDEN
  );
}

/**
 * 發送未找到錯誤回應
 *
 * @param res - Express Response 物件
 * @param resource - 資源名稱
 */
export function sendNotFound(
  res: Response,
  resource: string = '資源'
): void {
  sendError(
    res,
    'NOT_FOUND',
    `${resource}不存在`,
    HTTP_STATUS.NOT_FOUND
  );
}

/**
 * 發送內部錯誤回應
 *
 * @param res - Express Response 物件
 * @param error - 錯誤物件
 * @param customMessage - 自訂錯誤訊息
 */
export function sendInternalError(
  res: Response,
  error: any,
  customMessage?: string
): void {
  const message = customMessage || '內部伺服器錯誤';
  const details = error?.message || error;

  sendError(
    res,
    'INTERNAL_ERROR',
    message,
    HTTP_STATUS.INTERNAL_SERVER_ERROR,
    details
  );
}
