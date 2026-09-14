/**
 * Các hằng số và Enum dùng chung cho toàn bộ hệ thống
 */

const PUBLISHER_STATUS = Object.freeze({
  PENDING: 'PENDING',
  FOUND: 'FOUND',
  NOT_FOUND: 'NOT_FOUND',
  ERROR: 'ERROR',
  POST_UNAVAILABLE: 'POST_UNAVAILABLE',
  LOGIN_REQUIRED: 'LOGIN_REQUIRED'
});

const POST_TYPE = Object.freeze({
  ORIGINAL: 'ORIGINAL',
  SHARED: 'SHARED'
});

const SORT_COLUMNS = Object.freeze({
  CREATED_TIME: 'created_time',
  LIKES_COUNT: 'likes_count',
  COMMENTS_COUNT: 'comments_count',
  SHARES_COUNT: 'shares_count'
});

module.exports = {
  PUBLISHER_STATUS,
  POST_TYPE,
  SORT_COLUMNS
};
