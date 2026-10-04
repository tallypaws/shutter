<script lang="ts">
	let { bitmap = null, alt = '', ...restProps } = $props();

	let canvas: HTMLCanvasElement | null = $state(null);
	let previousBitmap: ImageBitmap | null = null;

	$effect(() => {
		if (previousBitmap && previousBitmap !== bitmap) {
		}
		previousBitmap = bitmap;

		if (!canvas || !bitmap) return;

		canvas.width = bitmap.width;
		canvas.height = bitmap.height;

		const ctx = canvas.getContext('2d');
		if (ctx) {
			ctx.clearRect(0, 0, canvas.width, canvas.height);
			ctx.drawImage(bitmap, 0, 0);
		}
	});
</script>

<canvas bind:this={canvas} role="img" aria-label={alt} {...restProps}></canvas>

<style>
	canvas {
		display: inline-block;
		max-height: 100%;
		max-width: 100%;
		height: auto;
		box-sizing: border-box;
	}
</style>
