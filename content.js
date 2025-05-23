chrome.runtime.onMessage.addListener(function (request, sender, sendResponse) {
	if (request.action === 'searchScreenshot') {
		const img = new Image();
		img.src = request.screenshot;
		img.onload = function () {
			const canvas = document.createElement('canvas');
			canvas.width = img.width;
			canvas.height = img.height;
			const ctx = canvas.getContext('2d');
			ctx.drawImage(img, 0, 0);

			// Now you can insert the image into a form, input, or use it however needed
			const fileInput = document.querySelector('input[type="file"]');
			if (fileInput) {
				canvas.toBlob(function (blob) {
					const file = new File([blob], 'screenshot.png', {
						type: 'image/png',
					});
					const dataTransfer = new DataTransfer();
					dataTransfer.items.add(file);
					fileInput.files = dataTransfer.files;
					fileInput.dispatchEvent(new Event('change', { bubbles: true }));
				});
			}
		};
	}
});
