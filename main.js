// Main application entry point - initializes all components with proper loading sequence
class InfiniteCanvas {
    constructor() {
        this.world = null;
        this.cardManager = null;
        this.sidebar = null;
        this.storage = null;
        this.loadingOverlay = null;
        
        this.init();
    }
    
    init() {
        // Wait for DOM to be ready
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => this.start());
        } else {
            this.start();
        }
    }
    
    async start() {
        console.log('Initializing Infinite Canvas...');
        
        // Show loading overlay
        this.loadingOverlay = document.getElementById('loadingOverlay');
        
        try {
            // Initialize components in proper order
            await this.initializeComponents();
            
            // Load saved data and apply settings
            await this.loadApplicationState();
            
            // Setup additional functionality
            this.setupGlobalEvents();
            
            console.log('Infinite Canvas initialized successfully!');
            
        } catch (error) {
            console.error('Failed to initialize Infinite Canvas:', error);
        } finally {
            // Hide loading overlay
            setTimeout(() => {
                this.loadingOverlay.classList.add('hidden');
                setTimeout(() => {
                    this.loadingOverlay.style.display = 'none';
                }, 300);
            }, 500); // Small delay to ensure everything is loaded
        }
    }
    
    async initializeComponents() {
        // Initialize storage first
        this.storage = new Storage();
        window.storage = this.storage;
        
        // Initialize world (panning, zooming, grid)
        this.world = new World();
        window.world = this.world;
        
        // Initialize card manager
        this.cardManager = new CardManager(this.world);
        window.cardManager = this.cardManager;
        
        // Initialize sidebar (including loading its width first)
        this.sidebar = new Sidebar();
        window.sidebar = this.sidebar;
        
        // Small delay to ensure all components are ready
        await new Promise(resolve => setTimeout(resolve, 100));
    }
    
    async loadApplicationState() {
        // Load saved data
        const savedData = this.storage.loadData();
        
        if (savedData && savedData.cards && savedData.cards.length > 0) {
            console.log('Loading saved cards and world state...');
            
            // Load cards first
            this.cardManager.loadCards(savedData.cards);
            
            // Apply world state (position and zoom) before showing
            if (savedData.worldState) {
                this.storage.applyWorldState(savedData.worldState);
            } else {
                // Center view if no saved world state
                this.world.centerView();
                this.world.updateUI();
            }
        } else {
            console.log('No saved data found, creating default setup...');
            
            // Center view first
            this.world.centerView();
            
            // Create default card
            const defaultCards = this.storage.getDefaultCards();
            defaultCards.forEach(cardData => {
                this.cardManager.createCard(cardData);
            });
            
            // Update world view
            this.world.updateUI();
            
            // Save the default setup
            this.storage.saveCards(defaultCards);
        }
        
        // Ensure world position is properly set
        await new Promise(resolve => setTimeout(resolve, 50));
        this.world.updateUI();
    }
    
    setupGlobalEvents() {
        // Keyboard shortcuts
        document.addEventListener('keydown', (e) => {
            // Ctrl/Cmd + N: New card
            if ((e.ctrlKey || e.metaKey) && e.key === 'n') {
                e.preventDefault();
                this.cardManager.addNewCard();
            }
            
            // Ctrl/Cmd + D: Duplicate active card
            if ((e.ctrlKey || e.metaKey) && e.key === 'd') {
                e.preventDefault();
                if (this.cardManager.activeCard) {
                    this.cardManager.duplicateCard(this.cardManager.activeCard);
                }
            }
            
            // Ctrl/Cmd + S: Manual save
            if ((e.ctrlKey || e.metaKey) && e.key === 's') {
                e.preventDefault();
                this.storage.saveData({
                    cards: this.cardManager.getAllCards(),
                    worldState: this.storage.getWorldState()
                });
                this.showNotification('Saved!');
            }
            
            // Ctrl/Cmd + E: Export data
            if ((e.ctrlKey || e.metaKey) && e.key === 'e') {
                e.preventDefault();
                this.storage.exportData();
            }
            
            // Delete key: Delete selected card
            if (e.key === 'Delete' && this.cardManager.activeCard && !this.sidebar.isOpen) {
                if (confirm('Are you sure you want to delete the selected card?')) {
                    this.cardManager.deleteCard(this.cardManager.activeCard);
                }
            }
        });
        
        // Auto-save world state on pan/zoom
        let worldSaveTimeout = null;
        const originalUpdateUI = this.world.updateUI.bind(this.world);
        this.world.updateUI = () => {
            originalUpdateUI();
            
            // Debounced world state save
            if (worldSaveTimeout) clearTimeout(worldSaveTimeout);
            worldSaveTimeout = setTimeout(() => {
                this.storage.saveWorldState(this.storage.getWorldState());
            }, 2000);
        };
        
        // Handle file drops for import
        document.addEventListener('dragover', (e) => {
            e.preventDefault();
        });
        
        document.addEventListener('drop', (e) => {
            e.preventDefault();
            const files = Array.from(e.dataTransfer.files);
            const jsonFile = files.find(file => file.type === 'application/json' || file.name.endsWith('.json'));
            
            if (jsonFile) {
                this.importData(jsonFile);
            }
        });
        
        // Window resize handler
        window.addEventListener('resize', () => {
            this.world.updateUI();
        });
        
        // Before unload - save data
        window.addEventListener('beforeunload', () => {
            this.storage.saveData({
                cards: this.cardManager.getAllCards(),
                worldState: this.storage.getWorldState()
            });
        });
    }
    
    // Import data from file
    async importData(file) {
        try {
            await this.storage.importData(file);
            this.showNotification('Data imported successfully!');
        } catch (error) {
            console.error('Import failed:', error);
            this.showNotification('Import failed: ' + error.message, 'error');
        }
    }
    
    // Show notification to user
    showNotification(message, type = 'success') {
        const notification = document.createElement('div');
        notification.style.cssText = `
            position: fixed;
            top: 80px;
            right: 20px;
            padding: 12px 20px;
            background: ${type === 'error' ? '#ef4444' : '#10b981'};
            color: white;
            border-radius: 6px;
            font-size: 14px;
            z-index: 3000;
            animation: slideIn 0.3s ease;
            box-shadow: 0 4px 20px rgba(0, 0, 0, 0.3);
        `;
        notification.textContent = message;
        
        // Add slide-in animation
        const style = document.createElement('style');
        style.textContent = `
            @keyframes slideIn {
                from { transform: translateX(100%); opacity: 0; }
                to { transform: translateX(0); opacity: 1; }
            }
        `;
        document.head.appendChild(style);
        
        document.body.appendChild(notification);
        
        // Remove after delay
        setTimeout(() => {
            notification.style.animation = 'slideIn 0.3s ease reverse';
            setTimeout(() => {
                if (notification.parentNode) {
                    notification.parentNode.removeChild(notification);
                }
                if (style.parentNode) {
                    style.parentNode.removeChild(style);
                }
            }, 300);
        }, 3000);
    }
    
    // Reset application to defaults
    reset() {
        if (confirm('Are you sure you want to reset everything? This will delete all cards and cannot be undone.')) {
            this.storage.clearData();
            this.cardManager.loadCards([]);
            this.world.centerView();
            this.world.scale = this.world.targetScale = 1;
            this.world.updateUI();
            this.storage.initialize();
            this.showNotification('Reset complete!');
        }
    }
    
    // Get application statistics
    getStats() {
        return {
            cardCount: this.cardManager.cards.size,
            worldPosition: {
                x: Math.round(this.world.translateX),
                y: Math.round(this.world.translateY)
            },
            zoom: Math.round(this.world.scale * 100) + '%',
            sidebarWidth: this.sidebar.width + 'px',
            dataSize: JSON.stringify(this.storage.loadData()).length + ' bytes'
        };
    }
}

// Global utility functions
window.InfiniteCanvas = {
    // Expose useful functions globally
    addCard: () => window.cardManager?.addNewCard(),
    duplicateCard: () => {
        if (window.cardManager?.activeCard) {
            return window.cardManager.duplicateCard(window.cardManager.activeCard);
        }
    },
    reset: () => window.app?.reset(),
    export: () => window.storage?.exportData(),
    stats: () => window.app?.getStats(),
    centerView: () => {
        if (window.world) {
            window.world.centerView();
            window.world.updateUI();
        }
    }
};

// Initialize the application
window.app = new InfiniteCanvas();

// Add some helpful console messages
console.log('%cInfinite Canvas App', 'font-size: 20px; font-weight: bold; color: #3b82f6;');
console.log('Available commands:');
console.log('- InfiniteCanvas.addCard() - Add a new card');
console.log('- InfiniteCanvas.duplicateCard() - Duplicate active card');
console.log('- InfiniteCanvas.reset() - Reset everything');
console.log('- InfiniteCanvas.export() - Export data');
console.log('- InfiniteCanvas.stats() - Show statistics');
console.log('- InfiniteCanvas.centerView() - Center the view');
console.log('');
console.log('Keyboard shortcuts:');
console.log('- Ctrl/Cmd + N: New card');
console.log('- Ctrl/Cmd + D: Duplicate active card');
console.log('- Ctrl/Cmd + S: Save');
console.log('- Ctrl/Cmd + E: Export');
console.log('- Delete: Delete selected card');
console.log('- Escape: Close sidebar');