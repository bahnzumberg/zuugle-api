import rateLimit from 'express-rate-limit';

/**
 * Standard rate limiter for general API endpoints
 * 100 requests per 15 minutes per IP
 */
export const standardLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100, // Limit each IP to 100 requests per windowMs
    message: {
        success: false,
        error: 'Too many requests from this IP, please try again later.'
    },
    standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
    legacyHeaders: false, // Disable the `X-RateLimit-*` headers
});

/**
 * Stricter rate limiter for search endpoints
 * 50 requests per 15 minutes per IP
 */
export const searchLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 50, // Limit each IP to 50 requests per windowMs
    message: {
        success: false,
        error: 'Too many search requests, please try again later.'
    },
    standardHeaders: true,
    legacyHeaders: false,
});

/**
 * Very strict rate limiter for resource-intensive operations
 * 20 requests per 15 minutes per IP
 */
export const strictLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 20, // Limit each IP to 20 requests per windowMs
    message: {
        success: false,
        error: 'Too many requests for this resource, please try again later.'
    },
    standardHeaders: true,
    legacyHeaders: false,
});
