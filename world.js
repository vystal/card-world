// World management - handles panning, zooming, and grid rendering
class World {
    constructor() {
        // State
        this.isDragging = false;
        this.startX = 0;
        this.startY = 0;
        this.translateX = 0;
        this.translateY = 0;
        
        // Animation targets
        this.targetScale = 1;
        this.targetTX = 0;
        this.targetTY = 0;
        this.rafId = null;
        this.DAMPING = 0.2;
        
        // Zoom settings
        this.scale = 1;
        this.MIN_SCALE = 0.1;  // Extended zoom out
        this.MAX_SCALE = 2;    // Extended zoom in
        this.ZOOM_SENSITIVITY = 0.0015;
        
        // Grid settings
        this.BASE_GRID_SPACING = 20;
        this.DOT_RADIUS_PX = 1;
        
        // DOM elements
        this.viewport = document.getElementById('viewport');
        this.world = document.getElementById('world');
        this.status = document.getElementById('status');
        
        this.init();
    }
    
    init() {
        this.setupEventListeners();
        this.centerView(); // Start with (0,0) in the center
        this.updateUI();
    }
    
    centerView() {
        const rect = this.viewport.getBoundingClientRect();
        this.translateX = this.targetTX = rect.width / 2;
        this.translateY = this.targetTY = rect.height / 2;
    }
    
    setupEventListeners() {
        // Left mouse button panning (changed from middle button)
        this.viewport.addEventListener('mousedown', (e) => {
            if (e.button === 0 && !window.cardManager?.isDraggingCard && !e.target.closest('.card')) {
                e.preventDefault();
                this.isDragging = true;
                this.startX = e.clientX - this.translateX;
                this.startY = e.clientY - this.translateY;
                this.world.style.transition = 'none';
            }
        });
        
        document.addEventListener('mousemove', (e) => {
            if (!this.isDragging || window.cardManager?.isDraggingCard) return;
            
            this.translateX = this.targetTX = e.clientX - this.startX;
            this.translateY = this.targetTY = e.clientY - this.startY;
            this.updateUI();
        });
        
        document.addEventListener('mouseup', (e) => {
            if (e.button === 0 && this.isDragging) {
                this.isDragging = false;
            }
        });
        
        // Zoom with mouse wheel
        this.viewport.addEventListener('wheel', (e) => {
            if (window.cardManager?.isDraggingCard) return;
            
            e.preventDefault();
            
            // Normalize delta for mouse vs trackpad
            const deltaY = (e.deltaMode === 1) ? e.deltaY * 16
                : (e.deltaMode === 2) ? e.deltaY * 800
                    : e.deltaY;
            
            const rect = this.viewport.getBoundingClientRect();
            const mouseX = e.clientX - rect.left;
            const mouseY = e.clientY - rect.top;
            
            // Pre-zoom world coords under cursor
            const worldX = (mouseX - this.targetTX);
            const worldY = (mouseY - this.targetTY);
            
            // Compute target zoom
            const zoom = Math.exp(-deltaY * this.ZOOM_SENSITIVITY);
            const newTargetScale = Math.min(this.MAX_SCALE, Math.max(this.MIN_SCALE, this.targetScale * zoom));
            const scaleFactor = newTargetScale / this.targetScale;
            
            // Re-anchor pan so cursor stays fixed while zooming
            this.targetTX = mouseX - worldX * scaleFactor;
            this.targetTY = mouseY - worldY * scaleFactor;
            this.targetScale = newTargetScale;
            
            this.kickAnimation();
        }, { passive: false });
        
        // Prevent context menu
        this.viewport.addEventListener('contextmenu', (e) => {
            e.preventDefault();
        });
    }
    
    applyWorldTransform() {
        this.world.style.transform = `translate(${this.translateX}px, ${this.translateY}px) scale(${this.scale})`;
    }
    
applyGrid() {
    // Hide grid when zoomed out too far
    if (this.scale < 0.35) {
        this.viewport.style.backgroundImage = 'none';
        return;
    }
    
    const stepPx = this.BASE_GRID_SPACING * this.scale;
    const offsetX = ((this.translateX % stepPx) + stepPx) % stepPx;
    const offsetY = ((this.translateY % stepPx) + stepPx) % stepPx;
    
    const dotRadius = Math.max(0.5, 1.3 * this.scale);
    
    this.viewport.style.backgroundImage = `radial-gradient(circle, #444 ${dotRadius}px, transparent ${dotRadius}px)`;
    this.viewport.style.backgroundSize = `${stepPx}px ${stepPx}px`;
    this.viewport.style.backgroundPosition = `${offsetX}px ${offsetY}px`;
    this.viewport.style.backgroundRepeat = 'repeat';
}
    
    updateUI() {
        this.applyWorldTransform();
        this.applyGrid();
        this.status.textContent = 
            `Position: (${Math.round(this.translateX)}, ${Math.round(this.translateY)}) • Zoom: ${Math.round(this.scale * 100)}%`;
    }
    
    animate() {
        // Lerp current values toward targets
        this.translateX += (this.targetTX - this.translateX) * this.DAMPING;
        this.translateY += (this.targetTY - this.translateY) * this.DAMPING;
        this.scale += (this.targetScale - this.scale) * this.DAMPING;
        
        this.updateUI();
        
        // Stop when close enough
        const done = 
            Math.abs(this.targetTX - this.translateX) < 0.01 &&
            Math.abs(this.targetTY - this.translateY) < 0.01 &&
            Math.abs(this.targetScale - this.scale) < 0.0001;
        
        if (!done) {
            this.rafId = requestAnimationFrame(() => this.animate());
        } else {
            this.rafId = null;
        }
    }
    
    kickAnimation() {
        if (this.rafId === null) {
            this.rafId = requestAnimationFrame(() => this.animate());
        }
    }
    
    // Convert screen coordinates to world coordinates
    screenToWorld(screenX, screenY) {
        const worldX = (screenX - this.translateX) / this.scale;
        const worldY = (screenY - this.translateY) / this.scale;
        return { x: worldX, y: worldY };
    }
    
    // Convert world coordinates to screen coordinates
    worldToScreen(worldX, worldY) {
        const screenX = worldX * this.scale + this.translateX;
        const screenY = worldY * this.scale + this.translateY;
        return { x: screenX, y: screenY };
    }
    
    // Get current world bounds visible on screen
    getVisibleBounds() {
        const rect = this.viewport.getBoundingClientRect();
        const topLeft = this.screenToWorld(0, 0);
        const bottomRight = this.screenToWorld(rect.width, rect.height);
        
        return {
            left: topLeft.x,
            top: topLeft.y,
            right: bottomRight.x,
            bottom: bottomRight.y,
            width: bottomRight.x - topLeft.x,
            height: bottomRight.y - topLeft.y
        };
    }
}