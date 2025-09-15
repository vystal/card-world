// Card management - handles card creation, dragging, and interaction
class CardManager {
    constructor(world) {
        this.world = world;
        this.cards = new Map();
        this.nextId = 1;
        this.activeCard = null;
        
        // Dragging state
        this.isDraggingCard = false;
        this.draggedCard = null;
        this.dragOffset = { x: 0, y: 0 };
        
        // Snapping
        this.SNAP_DISTANCE = 5; // pixels in world coordinates
        this.snapIndicators = { x: null, y: null };
        
        this.init();
    }
    
    init() {
        this.setupEventListeners();
    }
    
    setupEventListeners() {
        // Card double-click for editing
        this.world.world.addEventListener('dblclick', (e) => {
            const card = e.target.closest('.card');
            if (card && !this.isDraggingCard) {
                this.selectCard(card.dataset.cardId);
            }
        });
        
        // Card dragging - both from drag handle and card body
        this.world.world.addEventListener('mousedown', (e) => {
            const card = e.target.closest('.card');
            if (card && e.button === 0) {
                // Check if it's a drag handle or card body (but not content that might have text selection)
                const dragHandle = e.target.closest('.drag-handle');
                const cardContent = e.target.closest('.card-content');
                
                if (dragHandle || (card && !cardContent)) {
                    e.preventDefault();
                    e.stopPropagation();
                    this.startDragging(card, e);
                }
            }
        });
        
        document.addEventListener('mousemove', (e) => {
            if (this.isDraggingCard && this.draggedCard) {
                this.updateCardDrag(e);
            }
        });
        
        document.addEventListener('mouseup', (e) => {
            if (this.isDraggingCard && e.button === 0) {
                this.endDragging();
            }
        });
    }
    
    createCard(data = {}) {
        const id = data.id || this.nextId++;
        
        const cardData = {
            id: id,
            x: data.x || 0,
            y: data.y || 0,
            width: data.width || 300,
            height: data.height !== undefined ? data.height : 'auto',
            content: data.content || '<p>New card content...</p>',
            ...data
        };
        
        const cardElement = this.createElement(cardData);
        this.world.world.appendChild(cardElement);
        this.cards.set(id, cardData);
        
        // Update next ID if we're loading from storage
        if (id >= this.nextId) {
            this.nextId = id + 1;
        }
        
        return cardData;
    }
    
    createElement(cardData) {
        const card = document.createElement('div');
        card.className = 'card';
        card.dataset.cardId = cardData.id;
        card.style.left = `${cardData.x}px`;
        card.style.top = `${cardData.y}px`;
        card.style.width = `${cardData.width}px`;
        
        // Handle height - 'auto' or specific pixel value
        if (cardData.height === 'auto') {
            card.style.height = 'auto';
        } else {
            card.style.height = `${cardData.height}px`;
        }
        
        card.innerHTML = `
            <div class="drag-handle"></div>
            <div class="card-content">${cardData.content}</div>
        `;
        
        return card;
    }
    
    updateCard(id, updates) {
        const cardData = this.cards.get(id);
        if (!cardData) return;
        
        Object.assign(cardData, updates);
        
        const element = this.world.world.querySelector(`[data-card-id="${id}"]`);
        if (element) {
            if (updates.x !== undefined) element.style.left = `${cardData.x}px`;
            if (updates.y !== undefined) element.style.top = `${cardData.y}px`;
            if (updates.width !== undefined) element.style.width = `${cardData.width}px`;
            if (updates.height !== undefined) {
                if (cardData.height === 'auto') {
                    element.style.height = 'auto';
                } else {
                    element.style.height = `${cardData.height}px`;
                }
            }
            if (updates.content !== undefined) {
                element.querySelector('.card-content').innerHTML = cardData.content;
            }
        }
        
        // Save to storage
        if (window.storage) {
            window.storage.saveCards(Array.from(this.cards.values()));
        }
    }
    
    deleteCard(id) {
        const element = this.world.world.querySelector(`[data-card-id="${id}"]`);
        if (element) {
            element.remove();
        }
        
        this.cards.delete(id);
        
        // Close sidebar if this was the active card
        if (this.activeCard === id) {
            this.activeCard = null;
            if (window.sidebar) {
                window.sidebar.close();
            }
        }
        
        // Save to storage
        if (window.storage) {
            window.storage.saveCards(Array.from(this.cards.values()));
        }
    }
    
    duplicateCard(id) {
        const originalCard = this.cards.get(id);
        if (!originalCard) return;
        
        // Create duplicate with offset position
        const duplicateData = {
            ...originalCard,
            id: this.nextId++,
            x: originalCard.x + 50, // Offset by 50px
            y: originalCard.y + 50  // Offset by 50px
        };
        
        const newCard = this.createCard(duplicateData);
        
        // Save to storage
        if (window.storage) {
            window.storage.saveCards(Array.from(this.cards.values()));
        }
        
        // Select the new card
        this.selectCard(newCard.id);
        
        return newCard;
    }
    
    selectCard(id) {
        // Deselect previous card
        if (this.activeCard) {
            const prevElement = this.world.world.querySelector(`[data-card-id="${this.activeCard}"]`);
            if (prevElement) {
                prevElement.classList.remove('active');
            }
        }
        
        // Select new card
        this.activeCard = parseInt(id);
        const element = this.world.world.querySelector(`[data-card-id="${id}"]`);
        if (element) {
            element.classList.add('active');
        }
        
        // Open sidebar with card data
        if (window.sidebar) {
            const cardData = this.cards.get(this.activeCard);
            window.sidebar.open(cardData);
        }
    }
    
    startDragging(cardElement, event) {
        this.isDraggingCard = true;
        this.draggedCard = cardElement;
        
        // Calculate world coordinates immediately without using getBoundingClientRect
        const mouseWorldPos = this.world.screenToWorld(event.clientX, event.clientY);
        
        // Get current card position directly from data
        const cardId = parseInt(cardElement.dataset.cardId);
        const cardData = this.cards.get(cardId);
        
        // Store offset from mouse to card's top-left corner
        this.dragOffset.x = mouseWorldPos.x - cardData.x;
        this.dragOffset.y = mouseWorldPos.y - cardData.y;
        
        cardElement.classList.add('dragging');
    }
    
    updateCardDrag(event) {
        if (!this.draggedCard) return;
        
        // Get mouse position in world coordinates immediately
        const mouseWorldPos = this.world.screenToWorld(event.clientX, event.clientY);
        
        let newX = mouseWorldPos.x - this.dragOffset.x;
        let newY = mouseWorldPos.y - this.dragOffset.y;
        
        const cardId = parseInt(this.draggedCard.dataset.cardId);
        const cardData = this.cards.get(cardId);
        
        // Apply snapping
        const snapped = this.applySnapping(newX, newY, cardData);
        newX = snapped.x;
        newY = snapped.y;
        
        // Update snap indicators
        this.updateSnapIndicators(snapped.snapLineX, snapped.snapLineY);
        
        // Update position immediately in DOM and data
        this.draggedCard.style.left = `${newX}px`;
        this.draggedCard.style.top = `${newY}px`;
        cardData.x = newX;
        cardData.y = newY;
    }
    
    endDragging() {
        if (this.draggedCard) {
            this.draggedCard.classList.remove('dragging');
            
            // Save final position
            const cardId = parseInt(this.draggedCard.dataset.cardId);
            if (window.storage) {
                window.storage.saveCards(Array.from(this.cards.values()));
            }
            
            this.draggedCard = null;
        }
        
        this.isDraggingCard = false;
        this.hideSnapIndicators();
    }
    
    applySnapping(x, y, draggedCardData) {
        let snappedX = x;
        let snappedY = y;
        let snapLineX = null;
        let snapLineY = null;
        
        let minXDist = this.SNAP_DISTANCE + 1;
        let minYDist = this.SNAP_DISTANCE + 1;
        
        // Check against all other cards
        for (const [id, cardData] of this.cards) {
            if (id === draggedCardData.id) continue;
            
            // Get actual height for snapping calculations
            const draggedHeight = this.getCardActualHeight(draggedCardData);
            const targetHeight = this.getCardActualHeight(cardData);
            
            // X snapping - check all possible alignments
            const xAlignments = [
                { draggedPos: x, targetPos: cardData.x, snapLine: cardData.x },           // left to left
                { draggedPos: x, targetPos: cardData.x + cardData.width, snapLine: cardData.x + cardData.width },       // left to right  
                { draggedPos: x + draggedCardData.width, targetPos: cardData.x, snapLine: cardData.x },  // right to left
                { draggedPos: x + draggedCardData.width, targetPos: cardData.x + cardData.width, snapLine: cardData.x + cardData.width } // right to right
            ];
            
            xAlignments.forEach(align => {
                const dist = Math.abs(align.draggedPos - align.targetPos);
                if (dist < this.SNAP_DISTANCE && dist < minXDist) {
                    minXDist = dist;
                    snappedX = x + (align.targetPos - align.draggedPos);
                    snapLineX = align.snapLine;
                }
            });
            
            // Y snapping - check all possible alignments using actual heights
            const yAlignments = [
                { draggedPos: y, targetPos: cardData.y, snapLine: cardData.y },             // top to top
                { draggedPos: y, targetPos: cardData.y + targetHeight, snapLine: cardData.y + targetHeight },       // top to bottom
                { draggedPos: y + draggedHeight, targetPos: cardData.y, snapLine: cardData.y },    // bottom to top
                { draggedPos: y + draggedHeight, targetPos: cardData.y + targetHeight, snapLine: cardData.y + targetHeight } // bottom to bottom
            ];
            
            yAlignments.forEach(align => {
                const dist = Math.abs(align.draggedPos - align.targetPos);
                if (dist < this.SNAP_DISTANCE && dist < minYDist) {
                    minYDist = dist;
                    snappedY = y + (align.targetPos - align.draggedPos);
                    snapLineY = align.snapLine;
                }
            });
        }
        
        return {
            x: snappedX,
            y: snappedY,
            snapLineX,
            snapLineY
        };
    }
    
    getCardActualHeight(cardData) {
        if (cardData.height === 'auto') {
            // For auto height, try to get actual height from DOM element
            const element = this.world.world.querySelector(`[data-card-id="${cardData.id}"]`);
            if (element) {
                return element.offsetHeight;
            }
            // Fallback to minimum height
            return 100;
        }
        return cardData.height;
    }
    
    updateSnapIndicators(snapLineX, snapLineY) {
        // Remove old indicators
        this.hideSnapIndicators();
        
        // Create new indicators
        if (snapLineX !== null) {
            this.snapIndicators.x = this.createSnapIndicator(true, snapLineX);
        }
        if (snapLineY !== null) {
            this.snapIndicators.y = this.createSnapIndicator(false, snapLineY);
        }
    }
    
    createSnapIndicator(isVertical, position) {
        const indicator = document.createElement('div');
        indicator.className = `snap-indicator ${isVertical ? 'vertical' : 'horizontal'}`;
        
        if (isVertical) {
            indicator.style.left = position + 'px';
        } else {
            indicator.style.top = position + 'px';
        }
        
        this.world.world.appendChild(indicator);
        return indicator;
    }
    
    hideSnapIndicators() {
        if (this.snapIndicators.x) {
            this.snapIndicators.x.remove();
            this.snapIndicators.x = null;
        }
        if (this.snapIndicators.y) {
            this.snapIndicators.y.remove();
            this.snapIndicators.y = null;
        }
    }
    
    // Get all card data for saving
    getAllCards() {
        return Array.from(this.cards.values());
    }
    
    // Load cards from data
    loadCards(cardsData) {
        // Clear existing cards
        this.cards.clear();
        this.world.world.querySelectorAll('.card').forEach(card => card.remove());
        
        // Create cards from data
        cardsData.forEach(cardData => {
            this.createCard(cardData);
        });
    }
    
    // Create a new card at the center of the current view
    addNewCard() {
        const bounds = this.world.getVisibleBounds();
        const centerX = bounds.left + bounds.width / 2;
        const centerY = bounds.top + bounds.height / 2;
        
        const newCard = this.createCard({
            x: centerX - 150, // Center the 300px wide card
            y: centerY - 75,  // Center the card vertically
            width: 300,
            height: 'auto',
            content: '<h2>New Card</h2><p>Double-click to edit this card content...</p>'
        });
        
        // Save to storage
        if (window.storage) {
            window.storage.saveCards(Array.from(this.cards.values()));
        }
        
        // Select the new card
        this.selectCard(newCard.id);
        
        return newCard;
    }
}