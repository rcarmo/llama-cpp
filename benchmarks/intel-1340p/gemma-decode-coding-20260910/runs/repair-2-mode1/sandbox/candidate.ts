export function mergeIntervalInterval(intervals: number[][]): number[][] {
    if (!intervals || intervals.length === 0) {
        return [];
    }

    const validatedInterval = (interval: number[]): [number, number] => {
        if (!interval || interval.length !== 2 || !Number.isFinite(interval[0]) || !Number.isFinite(interval[1])) {
            throw new Error("Invalid interval: must have two finite numeric endpoints.");
        }
        return interval[0] < interval[1] ? [interval[0], interval[1]] : [interval[1], interval[0]];
    };

    const normalized = intervals.map(interval => validatedInterval(interval));

    normalized.sort((a, b) => a[0] - b[0]);

    const result: number[][] = [];
    if (normalized.length > 0) {
        let current = [...normalized[0]];
        for (let i = 1; i < normalized.length; i++) {
            const next = normalized[i];
            if (next[0] <= current[1]) {
                current[1] = Math.max(current[1], next[1]);
            } else {
                result.push(current);
                current = [...next];
            }
        }
        result.push(current);
    }

    return result;
}
