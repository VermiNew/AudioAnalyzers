const LEVELS = {
    INFO: { color: '#3498db', label: 'INFO' },
    WARNING: { color: '#f39c12', label: 'WARN' },
    ERROR: { color: '#e74c3c', label: 'ERROR' },
    CRITICAL: { color: '#c0392b', label: 'CRIT' },
    DEBUG: { color: '#9b59b6', label: 'DEBUG' },
    TRACE: { color: '#2ecc71', label: 'TRACE' },
    NETWORK: { color: '#2980b9', label: 'NET' },
    SYSTEM: { color: '#7f8c8d', label: 'SYS' }
};

class Logger {
    constructor() {
        this.history = [];
    }

    getCallerInfo() {
        const error = new Error();
        const stack = error.stack.split('\n')[3];
        const match = stack.match(/at\s+(.+?)\s+\((.+?):(\d+):(\d+)\)/);
        
        if (match) {
            return {
                function: match[1],
                file: match[2].split('/').pop(),
                line: match[3],
                column: match[4]
            };
        }
        
        return null;
    }

    formatTimestamp() {
        const now = new Date();
        return now.toLocaleTimeString('en-US', { 
            hour12: false,
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
            fractionalSecondDigits: 3
        });
    }

    log(message, level = 'INFO') {
        const timestamp = this.formatTimestamp();
        const callerInfo = this.getCallerInfo();
        const levelInfo = LEVELS[level] || LEVELS.INFO;

        const logEntry = {
            timestamp,
            level,
            message,
            callerInfo
        };

        this.history.push(logEntry);

        const styles = {
            timestamp: 'color: #95a5a6; font-weight: normal;',
            level: `color: ${levelInfo.color}; font-weight: bold;`,
            file: 'color: #bdc3c7; font-weight: normal;',
            message: `color: ${levelInfo.color}; font-weight: normal;`,
            separator: 'color: #7f8c8d; font-weight: normal;'
        };

        const levelLabel = levelInfo.label.padEnd(5);
        const fileInfo = callerInfo ? 
            `${callerInfo.file}:${callerInfo.line}` : 
            'unknown';

        console.log(
            `%c${timestamp} %c${levelLabel} %c${fileInfo} %c${message}`,
            styles.timestamp,
            styles.level,
            styles.file,
            styles.message
        );

        return logEntry;
    }

    getHistory() {
        return this.history;
    }

    clearHistory() {
        this.history = [];
    }
}

const logger = new Logger();
export default logger.log.bind(logger);
export const getLogHistory = () => logger.getHistory();
export const clearLogHistory = () => logger.clearHistory(); 