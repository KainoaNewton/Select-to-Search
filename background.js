chrome.action.onClicked.addListener(function (tab) {
	initiateScreenCapture(tab.id);
});

chrome.commands.onCommand.addListener((command, tab) => {
	if (command === 'take-screenshot') {
		initiateScreenCapture(tab.id);
	}
});

function initiateScreenCapture(tabId) {
	chrome.scripting.executeScript({
		target: { tabId: tabId },
		function: createSelectionOverlay,
	});
}

function createSelectionOverlay() {
	const overlay = document.createElement('div');
	overlay.style.position = 'fixed';
	overlay.style.top = '0';
	overlay.style.left = '0';
	overlay.style.width = '100%';
	overlay.style.height = '100%';
	overlay.style.backgroundColor = 'rgba(0,0,0,0.5)';
	overlay.style.zIndex = '9999999';
	overlay.style.cursor = 'crosshair'; // Ensure the cursor is a crosshair on the overlay

	// Create the "Select region" text element
	const message = document.createElement('div');
	message.innerText = 'Select region';
	message.style.position = 'fixed';
	message.style.top = '40%'; // Move the text toward the middle vertically
	message.style.left = '50%';
	message.style.transform = 'translate(-50%, -50%)'; // Center both horizontally and vertically
	message.style.color = 'white';
	message.style.fontSize = '30px'; // Make the text larger
	message.style.fontWeight = 'bold'; // Make the text bold
	message.style.zIndex = '10000000'; // Ensure the text is on top of everything
	document.body.appendChild(message); // Add the message to the body

	let startX, startY, endX, endY;
	let isSelecting = false;

	// Escape key event listener to cancel selection
	function onEscapePress(e) {
		if (e.key === 'Escape') {
			// Remove the overlay and the message when escape is pressed
			document.body.removeChild(overlay);
			document.body.removeChild(message);
			document.removeEventListener('keydown', onEscapePress);
		}
	}

	document.addEventListener('keydown', onEscapePress); // Add escape key listener

	overlay.addEventListener('mousedown', (e) => {
		isSelecting = true;
		startX = e.clientX;
		startY = e.clientY;
	});

	overlay.addEventListener('mousemove', (e) => {
		if (isSelecting) {
			endX = e.clientX;
			endY = e.clientY;
			drawSelection();
		}
	});

	overlay.addEventListener('mouseup', () => {
		isSelecting = false;
		captureSelectedArea();
	});

	document.body.appendChild(overlay);

	function drawSelection() {
		const selection = document.createElement('div');
		selection.style.position = 'fixed';
		selection.style.border = '2px dotted red'; // Dotted red border
		selection.style.left = `${Math.min(startX, endX)}px`;
		selection.style.top = `${Math.min(startY, endY)}px`;
		selection.style.width = `${Math.abs(endX - startX)}px`;
		selection.style.height = `${Math.abs(endY - startY)}px`;
		selection.style.cursor = 'crosshair'; // Ensure the crosshair cursor remains visible during dragging
		overlay.innerHTML = ''; // Clear previous selections
		overlay.appendChild(selection); // Add the current selection
	}

	function captureSelectedArea() {
		const captureWidth = Math.abs(endX - startX);
		const captureHeight = Math.abs(endY - startY);

		// Remove the "Select region" message and escape listener when selection is complete
		document.body.removeChild(message);
		document.removeEventListener('keydown', onEscapePress); // Remove the escape key listener

		if (captureWidth === 0 || captureHeight === 0) {
			document.body.removeChild(overlay);
			return;
		}

		// Get page scroll positions and zoom factor
		const scrollX = window.scrollX;
		const scrollY = window.scrollY;
		const scale = window.devicePixelRatio; // Adjust for zoom factor

		// Calculate the offset due to browser UI elements
		const contentOffsetX =
			window.innerWidth - document.documentElement.clientWidth;
		const contentOffsetY =
			window.innerHeight - document.documentElement.clientHeight;

		// Adjust for browser UI offsets, zoom, and scroll
		const adjustedStartX =
			(Math.min(startX, endX) + scrollX + contentOffsetX) * scale;
		const adjustedStartY =
			(Math.min(startY, endY) + scrollY + contentOffsetY) * scale;
		const adjustedWidth = captureWidth * scale;
		const adjustedHeight = captureHeight * scale;

		// Send the captured dimensions along with scroll, zoom, and UI offsets
		chrome.runtime.sendMessage({
			action: 'captureTab',
			startX: adjustedStartX,
			startY: adjustedStartY,
			width: adjustedWidth,
			height: adjustedHeight,
			scale: scale,
		});

		document.body.removeChild(overlay);
	}
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
	if (request.action === 'captureTab') {
		chrome.tabs.captureVisibleTab(null, { format: 'png' }, function (dataUrl) {
			fetch(dataUrl)
				.then((response) => response.blob())
				.then((blob) => createImageBitmap(blob))
				.then((imageBitmap) => {
					// Create an OffscreenCanvas that matches the size of the cropped area
					const offscreenCanvas = new OffscreenCanvas(
						request.width,
						request.height
					);
					const ctx = offscreenCanvas.getContext('2d');

					// Draw the selected area of the image to the canvas
					ctx.drawImage(
						imageBitmap,
						request.startX,
						request.startY,
						request.width,
						request.height, // The selected part of the screen
						0,
						0,
						request.width,
						request.height // Drawn at (0,0) to the canvas
					);

					// Convert the canvas content to a Blob and then to base64
					offscreenCanvas.convertToBlob({ type: 'image/png' }).then((blob) => {
						const reader = new FileReader();
						reader.readAsDataURL(blob);
						reader.onloadend = function () {
							const base64data = reader.result;

							// Create a new tab and send the image data
							chrome.tabs.create(
								{ url: 'https://www.google.com/?olud' },
								function (newTab) {
									chrome.tabs.onUpdated.addListener(function listener(
										tabId,
										info
									) {
										if (tabId === newTab.id && info.status === 'complete') {
											chrome.tabs.onUpdated.removeListener(listener);
											chrome.tabs.sendMessage(tabId, {
												action: 'searchScreenshot',
												screenshot: base64data,
											});
										}
									});
								}
							);
						};
					});
				});
		});
	}
});
