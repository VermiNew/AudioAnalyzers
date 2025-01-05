class BaseVisualizer {
    constructor(analyzerNode, canvas) {
        this.analyzer = analyzerNode;
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
        this.dataArray = new Uint8Array(this.analyzer.frequencyBinCount);
        this.running = false;
        
        // Set canvas size
        this.resize();
        window.addEventListener('resize', () => this.resize());
    }

    resize() {
        const rect = this.canvas.getBoundingClientRect();
        this.canvas.width = rect.width * window.devicePixelRatio;
        this.canvas.height = rect.height * window.devicePixelRatio;
        this.ctx.scale(window.devicePixelRatio, window.devicePixelRatio);
    }

    start() {
        this.running = true;
        this.draw();
    }

    stop() {
        this.running = false;
    }

    clear() {
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    }
}

class WaveformVisualizer extends BaseVisualizer {
    draw() {
        if (!this.running) return;

        this.analyzer.getByteTimeDomainData(this.dataArray);
        this.clear();

        this.ctx.lineWidth = 2;
        this.ctx.strokeStyle = getComputedStyle(this.canvas).getPropertyValue('--dark-primary');
        this.ctx.beginPath();

        const sliceWidth = this.canvas.width / this.dataArray.length;
        let x = 0;

        for (let i = 0; i < this.dataArray.length; i++) {
            const v = this.dataArray[i] / 128.0;
            const y = v * (this.canvas.height / 2);

            if (i === 0) {
                this.ctx.moveTo(x, y);
            } else {
                this.ctx.lineTo(x, y);
            }

            x += sliceWidth;
        }

        this.ctx.lineTo(this.canvas.width, this.canvas.height / 2);
        this.ctx.stroke();

        requestAnimationFrame(() => this.draw());
    }
}

class BarVisualizer extends BaseVisualizer {
    draw() {
        if (!this.running) return;

        this.analyzer.getByteFrequencyData(this.dataArray);
        this.clear();

        const barWidth = (this.canvas.width / this.dataArray.length) * 2.5;
        let x = 0;

        const gradient = this.ctx.createLinearGradient(0, this.canvas.height, 0, 0);
        gradient.addColorStop(0, getComputedStyle(this.canvas).getPropertyValue('--dark-primary'));
        gradient.addColorStop(1, getComputedStyle(this.canvas).getPropertyValue('--dark-text'));
        this.ctx.fillStyle = gradient;

        for (let i = 0; i < this.dataArray.length; i++) {
            const barHeight = (this.dataArray[i] / 255) * this.canvas.height;
            this.ctx.fillRect(x, this.canvas.height - barHeight, barWidth, barHeight);
            x += barWidth + 1;
        }

        requestAnimationFrame(() => this.draw());
    }
}

class CircleVisualizer extends BaseVisualizer {
    draw() {
        if (!this.running) return;

        this.analyzer.getByteFrequencyData(this.dataArray);
        this.clear();

        const centerX = this.canvas.width / 2;
        const centerY = this.canvas.height / 2;
        const radius = Math.min(centerX, centerY) - 10;

        this.ctx.strokeStyle = getComputedStyle(this.canvas).getPropertyValue('--dark-primary');
        this.ctx.lineWidth = 2;

        for (let i = 0; i < this.dataArray.length; i++) {
            const amplitude = this.dataArray[i] / 255;
            const angle = (i / this.dataArray.length) * Math.PI * 2;
            
            const innerRadius = radius * 0.4;
            const outerRadius = radius * (0.4 + amplitude * 0.6);
            
            this.ctx.beginPath();
            this.ctx.moveTo(
                centerX + Math.cos(angle) * innerRadius,
                centerY + Math.sin(angle) * innerRadius
            );
            this.ctx.lineTo(
                centerX + Math.cos(angle) * outerRadius,
                centerY + Math.sin(angle) * outerRadius
            );
            this.ctx.stroke();
        }

        requestAnimationFrame(() => this.draw());
    }
}

export { WaveformVisualizer, BarVisualizer, CircleVisualizer }; 