// Card management - handles card creation, dragging, and interaction with multi-select and snap relationships
class CardManager {
    constructor(world) {
        this.world = world;
        this.cards = new Map();
        this.nextId = 1;
        this.activeCard = null;
        
        // Multi-selection
        this.selectedCards = new Set();
        this.isMultiSelecting = false;
        
        // Dragging state
        this.isDraggingCard = false;
        this.draggedCard = null;
        this.dragOffset = { x: 0, y: 0 };
        this.multiDragOffsets = new Map(); // For multi-selection dragging
        
        // Undo/Redo tracking
        this.dragStartPositions = new Map(); // Track positions at start of drag
        
        // Snapping
        this.SNAP_DISTANCE = 5; // pixels in world coordinates
        this.snapIndicators = { x: null, y: null };
        
        this.init();
    }
    
    init() {
        this.setupEventListeners();
        this.setupCtrlKeyTracking();
    }
    
    setupCtrlKeyTracking() {
        // Track Ctrl key state globally
        this.isCtrlPressed = false;
        
        document.addEventListener('keydown', (e) => {
            if (e.ctrlKey || e.metaKey) {
                this.isCtrlPressed = true;
            }
        });
        
        document.addEventListener('keyup', (e) => {
            if (!e.ctrlKey && !e.metaKey) {
                this.isCtrlPressed = false;
                // Clear multi-selection when Ctrl is released
                this.clearMultiSelection();
            }
        });
        
        // Handle window focus loss (Ctrl might be released outside window)
        window.addEventListener('blur', () => {
            this.isCtrlPressed = false;
            this.clearMultiSelection();
        });
    }
    
    clearMultiSelection() {
        // Keep only the active card selected, remove selected styling from others
        if (this.selectedCards.size > 1) {
            this.selectedCards.forEach(cardId => {
                if (cardId !== this.activeCard) {
                    const element = this.world.world.querySelector(`[data-card-id="${cardId}"]`);
                    if (element) {
                        element.classList.remove('selected');
                    }
                }
            });
            
            // Clear the selectedCards set and only keep the active card
            this.selectedCards.clear();
            if (this.activeCard) {
                this.selectedCards.add(this.activeCard);
                // Make sure active card still has proper styling
                const activeElement = this.world.world.querySelector(`[data-card-id="${this.activeCard}"]`);
                if (activeElement) {
                    activeElement.classList.add('active', 'selected');
                }
            }
        }
    }
    
    setupEventListeners() {
        // Card double-click for editing
        this.world.world.addEventListener('dblclick', (e) => {
            const card = e.target.closest('.card');
            if (card && !this.isDraggingCard) {
                this.selectCard(card.dataset.cardId, false); // Single select on double-click
            }
        });
        
        // Card single-click for selection
        this.world.world.addEventListener('click', (e) => {
            const card = e.target.closest('.card');
            if (card) {
                e.preventDefault();
                e.stopPropagation();
                // Only allow multi-select if Ctrl is actively pressed
                const isMultiSelect = this.isCtrlPressed;
                this.selectCard(card.dataset.cardId, isMultiSelect);
            } else if (!e.target.closest('.sidebar')) {
                // Clicked on empty space - clear selection
                this.clearSelection();
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
                    
                    const cardId = parseInt(card.dataset.cardId);
                    
                    // If card is not selected, select it (considering ctrl)
                    if (!this.selectedCards.has(cardId)) {
                        const isMultiSelect = this.isCtrlPressed;
                        this.selectCard(cardId, isMultiSelect);
                    }
                    
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
        card.className = 'card ql-container ql-snow';
        card.dataset.cardId = cardData.id;
        card.style.left = `${cardData.x}px`;
        card.style.top = `${cardData.y}px`;
        card.style.width = `${cardData.width}px`;
        
        // Handle height - auto or specific value
        if (cardData.height === 'auto' || cardData.height === undefined) {
            card.style.height = 'auto';
        } else {
            card.style.height = `${cardData.height}px`;
        }
        
        card.innerHTML = `
            <div class="drag-handle"></div>
            <div class="card-content ql-editor">${cardData.content}</div>
        `;
        
        return card;
    }
    
    updateCard(id, updates) {
        const cardData = this.cards.get(id);
        if (!cardData) return;
        
        // Track property changes for undo/redo
        const oldData = { ...cardData };
        
        Object.assign(cardData, updates);
        
        const element = this.world.world.querySelector(`[data-card-id="${id}"]`);
        if (element) {
            if (updates.x !== undefined) element.style.left = `${cardData.x}px`;
            if (updates.y !== undefined) element.style.top = `${cardData.y}px`;
            if (updates.width !== undefined) {
                element.style.width = `${cardData.width}px`;
                
                // Save resize state for undo/redo if width changed significantly
                if (Math.abs(oldData.width - cardData.width) > 5 && window.undoRedoManager) {
                    window.undoRedoManager.saveState('resize_card', {
                        cardId: id,
                        oldWidth: oldData.width,
                        newWidth: cardData.width
                    });
                }
            }
            if (updates.height !== undefined) {
                if (cardData.height === 'auto') {
                    element.style.height = 'auto';
                } else {
                    element.style.height = `${cardData.height}px`;
                }
                
                // Save resize state for undo/redo if height changed significantly
                if (oldData.height !== cardData.height && window.undoRedoManager) {
                    window.undoRedoManager.saveState('resize_card', {
                        cardId: id,
                        oldHeight: oldData.height,
                        newHeight: cardData.height
                    });
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
        this.selectedCards.delete(id);
        
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
            x: originalCard.x + 20,
            y: originalCard.y + 20
        };
        
        const newCard = this.createCard(duplicateData);
        
        // Save to storage
        if (window.storage) {
            window.storage.saveCards(Array.from(this.cards.values()));
        }
        
        // Select the new card
        this.selectCard(newCard.id, false);
        
        return newCard;
    }
    
    selectCard(id, isMultiSelect = false) {
        const cardId = parseInt(id);
        
        if (isMultiSelect) {
            // Multi-select mode
            if (this.selectedCards.has(cardId)) {
                // Deselect if already selected
                this.selectedCards.delete(cardId);
                const element = this.world.world.querySelector(`[data-card-id="${cardId}"]`);
                if (element) {
                    element.classList.remove('selected', 'active');
                }
                
                // If this was the active card, make another selected card active
                if (this.activeCard === cardId) {
                    const remainingSelected = Array.from(this.selectedCards);
                    if (remainingSelected.length > 0) {
                        this.activeCard = remainingSelected[0];
                        const newActiveElement = this.world.world.querySelector(`[data-card-id="${this.activeCard}"]`);
                        if (newActiveElement) {
                            newActiveElement.classList.add('active');
                        }
                    } else {
                        this.activeCard = null;
                    }
                }
            } else {
                // Add to selection
                this.selectedCards.add(cardId);
                const element = this.world.world.querySelector(`[data-card-id="${cardId}"]`);
                if (element) {
                    element.classList.add('selected');
                }
                
                // Remove active from previous active card
                if (this.activeCard && this.activeCard !== cardId) {
                    const prevActiveElement = this.world.world.querySelector(`[data-card-id="${this.activeCard}"]`);
                    if (prevActiveElement) {
                        prevActiveElement.classList.remove('active');
                    }
                }
                
                // Make this card the new active card
                this.activeCard = cardId;
                const element2 = this.world.world.querySelector(`[data-card-id="${cardId}"]`);
                if (element2) {
                    element2.classList.add('active');
                }
            }
        } else {
            // Single select mode - clear previous selection
            this.clearSelection();
            this.selectedCards.add(cardId);
            this.activeCard = cardId;
            
            const element = this.world.world.querySelector(`[data-card-id="${cardId}"]`);
            if (element) {
                element.classList.add('active', 'selected');
            }
        }
        
        // Open sidebar with active card data
        if (this.activeCard && window.sidebar) {
            const cardData = this.cards.get(this.activeCard);
            window.sidebar.open(cardData);
        }
    }
    
    clearSelection() {
        // Remove visual selection from all cards
        this.selectedCards.forEach(cardId => {
            const element = this.world.world.querySelector(`[data-card-id="${cardId}"]`);
            if (element) {
                element.classList.remove('active', 'selected');
            }
        });
        
        this.selectedCards.clear();
        this.activeCard = null;
        
        if (window.sidebar) {
            window.sidebar.close();
        }
    }
    
    startDragging(cardElement, event) {
        this.isDraggingCard = true;
        this.draggedCard = cardElement;
        
        // Calculate world coordinates immediately without using getBoundingClientRect
        const mouseWorldPos = this.world.screenToWorld(event.clientX, event.clientY);
        
        const cardId = parseInt(cardElement.dataset.cardId);
        
        // Save starting positions for undo/redo
        this.dragStartPositions.clear();
        
        // Setup drag offsets for all selected cards
        this.multiDragOffsets.clear();
        
        if (this.selectedCards.has(cardId)) {
            // Dragging a selected card - drag all selected cards
            const cardIds = Array.from(this.selectedCards);
            const startPositions = {};
            
            this.selectedCards.forEach(selectedId => {
                const selectedCard = this.cards.get(selectedId);
                if (selectedCard) {
                    // Save starting position for undo/redo
                    startPositions[selectedId] = { x: selectedCard.x, y: selectedCard.y };
                    this.dragStartPositions.set(selectedId, { x: selectedCard.x, y: selectedCard.y });
                    
                    this.multiDragOffsets.set(selectedId, {
                        x: mouseWorldPos.x - selectedCard.x,
                        y: mouseWorldPos.y - selectedCard.y
                    });
                    
                    const selectedElement = this.world.world.querySelector(`[data-card-id="${selectedId}"]`);
                    if (selectedElement) {
                        selectedElement.classList.add('dragging');
                    }
                }
            });
            
            // Save drag state for undo/redo
            if (window.undoRedoManager) {
                const operation = cardIds.length > 1 ? 'multi_card_move' : 'card_move';
                window.undoRedoManager.saveDragState(operation, cardIds, startPositions);
            }
        } else {
            // Dragging a non-selected card
            const cardData = this.cards.get(cardId);
            
            // Save starting position for undo/redo
            this.dragStartPositions.set(cardId, { x: cardData.x, y: cardData.y });
            
            this.dragOffset.x = mouseWorldPos.x - cardData.x;
            this.dragOffset.y = mouseWorldPos.y - cardData.y;
            cardElement.classList.add('dragging');
            
            // Save drag state for undo/redo
            if (window.undoRedoManager) {
                const startPositions = {};
                startPositions[cardId] = { x: cardData.x, y: cardData.y };
                window.undoRedoManager.saveDragState('card_move', [cardId], startPositions);
            }
        }
    }
    
    updateCardDrag(event) {
        if (!this.draggedCard) return;
        
        // Get mouse position in world coordinates immediately
        const mouseWorldPos = this.world.screenToWorld(event.clientX, event.clientY);
        const draggedCardId = parseInt(this.draggedCard.dataset.cardId);
        
        if (this.multiDragOffsets.size > 0) {
            // Multi-card dragging
            let snapX = null, snapY = null;
            let snapLineX = null, snapLineY = null;
            
            // Use the dragged card as the reference for snapping
            const draggedOffset = this.multiDragOffsets.get(draggedCardId);
            if (draggedOffset) {
                const draggedCard = this.cards.get(draggedCardId);
                const newX = mouseWorldPos.x - draggedOffset.x;
                const newY = mouseWorldPos.y - draggedOffset.y;
                
                // Calculate snap for the dragged card
                const snapped = this.applySnapping(newX, newY, draggedCard, this.selectedCards);
                snapX = snapped.x;
                snapY = snapped.y;
                snapLineX = snapped.snapLineX;
                snapLineY = snapped.snapLineY;
                
                // Calculate offset from original position
                const deltaX = snapX - newX;
                const deltaY = snapY - newY;
                
                // Update all selected cards
                this.multiDragOffsets.forEach((offset, cardId) => {
                    const cardData = this.cards.get(cardId);
                    const element = this.world.world.querySelector(`[data-card-id="${cardId}"]`);
                    
                    if (cardData && element) {
                        const cardNewX = mouseWorldPos.x - offset.x + deltaX;
                        const cardNewY = mouseWorldPos.y - offset.y + deltaY;
                        
                        element.style.left = `${cardNewX}px`;
                        element.style.top = `${cardNewY}px`;
                        cardData.x = cardNewX;
                        cardData.y = cardNewY;
                    }
                });
            }
            
            // Update snap indicators
            this.updateSnapIndicators(snapLineX, snapLineY);
        } else {
            // Single card dragging
            const cardId = parseInt(this.draggedCard.dataset.cardId);
            const cardData = this.cards.get(cardId);
            
            let newX = mouseWorldPos.x - this.dragOffset.x;
            let newY = mouseWorldPos.y - this.dragOffset.y;
            
            // Apply snapping
            const snapped = this.applySnapping(newX, newY, cardData, new Set([cardId]));
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
    }
    
    endDragging() {
        if (this.draggedCard) {
            // Clear dragging state from all cards
            if (this.multiDragOffsets.size > 0) {
                this.selectedCards.forEach(cardId => {
                    const element = this.world.world.querySelector(`[data-card-id="${cardId}"]`);
                    if (element) {
                        element.classList.remove('dragging');
                    }
                });
            } else {
                this.draggedCard.classList.remove('dragging');
            }
            
            // Finish drag operation for undo/redo
            if (window.undoRedoManager) {
                window.undoRedoManager.finishDragOperation();
            }
            
            // Save final position
            if (window.storage) {
                window.storage.saveCards(Array.from(this.cards.values()));
            }
            
            this.draggedCard = null;
            this.multiDragOffsets.clear();
            this.dragStartPositions.clear();
        }
        
        this.isDraggingCard = false;
        this.hideSnapIndicators();
    }
    
    applySnapping(x, y, draggedCardData, excludeCards) {
        let snappedX = x;
        let snappedY = y;
        let snapLineX = null;
        let snapLineY = null;
        
        let minXDist = this.SNAP_DISTANCE + 1;
        let minYDist = this.SNAP_DISTANCE + 1;
        
        // Check against all other cards
        for (const [id, cardData] of this.cards) {
            if (excludeCards.has(id)) continue;
            
            // Get actual height for snapping (auto height cards need DOM measurement)
            let cardHeight = cardData.height;
            if (cardHeight === 'auto') {
                const element = this.world.world.querySelector(`[data-card-id="${id}"]`);
                if (element) {
                    cardHeight = element.offsetHeight;
                }
            }
            
            let draggedHeight = draggedCardData.height;
            if (draggedHeight === 'auto') {
                const element = this.world.world.querySelector(`[data-card-id="${draggedCardData.id}"]`);
                if (element) {
                    draggedHeight = element.offsetHeight;
                }
            }
            
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
            
            // Y snapping - check all possible alignments
            const yAlignments = [
                { draggedPos: y, targetPos: cardData.y, snapLine: cardData.y },             // top to top
                { draggedPos: y, targetPos: cardData.y + cardHeight, snapLine: cardData.y + cardHeight },       // top to bottom
                { draggedPos: y + draggedHeight, targetPos: cardData.y, snapLine: cardData.y },    // bottom to top
                { draggedPos: y + draggedHeight, targetPos: cardData.y + cardHeight, snapLine: cardData.y + cardHeight } // bottom to bottom
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
        this.selectedCards.clear();
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
        
        // Save state before creating new card
        if (window.undoRedoManager) {
            window.undoRedoManager.saveState('create_card');
        }
        
        const newCard = this.createCard({
            x: centerX - 150, // Center the 300px wide card
            y: centerY - 75,  // Approximate center for auto-height card
            width: 300,
            height: 'auto',
            content: '<h2>New Card</h2><p>Double-click to edit this card content...</p>'
        });
        
        // Save to storage
        if (window.storage) {
            window.storage.saveCards(Array.from(this.cards.values()));
        }
        
        // Select the new card
        this.selectCard(newCard.id, false);
        
        return newCard;
    }
}