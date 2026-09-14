```typescript
export function mergeInterval(intervals: number[][]): number[][] {
    if (!intervals || intervals.length === 0) {
        return [];
    }

    // Validate and normalize intervals
    const validatedInterval = intervals.map((interval, index) => {
        if (!Array.isArray(interval) || interval.length !== 2) {
            throw new Error(`Interval at index ${index} must be an array of length 2.`);
        }
        const [start, end] = interval;
        if (!Number.isFinite(start) || !Number.isFinite(end)) {
            throw new Error(`Endpoints in interval at index ${index} must be finite numbers.`);
        }
        // Reverse endpoints if necessary
        return [Math.min(start, end), Math.max(start, end)];
    });

    // Sort intervals based on the start point
    const sortedInterval = [...validatedInterval].sort((a, b) => a[0] - b[0]);

    const merged: number[][] = [];
    if (sortedInterval.length === 0) {
        return [];
    }

    let currentInterval = [...sortedInterval[0]];

    for (let i = 1; i < sortedInterval.length; i++) {
        const nextInterval = sortedInterval[i];
        const [currentStart, currentEnd] = currentInterval;
        const [nextStart, nextEnd] = nextInterval;

        // Check for overlap or touching (nextStart <= currentEnd)
        if (nextStart <= currentEnd) {
            // Merge: extend the end of the current interval
            currentInterval[1] = Math.max(currentEnd, nextEnd);
        } else {
            // No overlap, push current interval and start a new one
            merged.push([...currentInterval]);
            currentInterval = [...nextInterval];
        }
    }

    // Push the last interval
    merged.push([...currentInterval]);

    return merged;
}

export function mergeInterval(intervals: number[][]): number[][] {
    if (!intervals || intervals.length === 0) {
        return [];
    }

    // Validate and normalize intervals
    const validatedInterval = intervals.map((interval, index) => {
        if (!Array.isArray(interval) || interval.length !== 2) {
            throw new Error(`Interval at index ${index} must be an array of length 2.`);
        }
        const [start, end] = interval;
        if (!Number.isFinite(start) || !Number.isFinite(end)) {
            throw new Error(`Endpoints in interval at index ${index} must be finite numbers.`);
        }
        // Reverse endpoints if necessary
        return [Math.min(start, end), Math.max(start, end)];
    });

    // Sort intervals based on the start point