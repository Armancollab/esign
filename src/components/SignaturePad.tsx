import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import SignaturePad from 'signature_pad'

type ExportFormat = 'png' | 'pdf'

type SigPoint = { x: number; y: number; pressure?: number; time?: number }
type SigPointGroup = { color?: string; points: SigPoint[] }
type SignaturePadWithFromData = SignaturePad & { fromData: (d: SigPointGroup[]) => void }

function useDevicePixelRatio() {
	const [ratio, setRatio] = useState<number>(window.devicePixelRatio || 1)
	useEffect(() => {
		const handler = () => setRatio(window.devicePixelRatio || 1)
		window.addEventListener('resize', handler)
		return () => window.removeEventListener('resize', handler)
	}, [])
	return ratio
}

function clamp(value: number, min: number, max: number) {
	return Math.max(min, Math.min(max, value))
}

function trimCanvas(source: HTMLCanvasElement, padding = 12): HTMLCanvasElement {
	const width = source.width
	const height = source.height
	const ctx = source.getContext('2d')!
	const imageData = ctx.getImageData(0, 0, width, height)
	const { data } = imageData

	let top = 0
	let left = 0
	let right = width - 1
	let bottom = height - 1
	let found = false

	for (let y = 0; y < height && !found; y++) {
		for (let x = 0; x < width; x++) {
			const idx = (y * width + x) * 4 + 3
			if (data[idx] !== 0) {
				top = y
				found = true
				break
			}
		}
	}

	found = false
	for (let y = height - 1; y >= 0 && !found; y--) {
		for (let x = 0; x < width; x++) {
			const idx = (y * width + x) * 4 + 3
			if (data[idx] !== 0) {
				bottom = y
				found = true
				break
			}
		}
	}

	found = false
	for (let x = 0; x < width && !found; x++) {
		for (let y = 0; y < height; y++) {
			const idx = (y * width + x) * 4 + 3
			if (data[idx] !== 0) {
				left = x
				found = true
				break
			}
		}
	}

	found = false
	for (let x = width - 1; x >= 0 && !found; x--) {
		for (let y = 0; y < height; y++) {
			const idx = (y * width + x) * 4 + 3
			if (data[idx] !== 0) {
				right = x
				found = true
				break
			}
		}
	}

	if (left > right || top > bottom) {
		const empty = document.createElement('canvas')
		empty.width = 1
		empty.height = 1
		return empty
	}

	const cropLeft = clamp(left - padding, 0, width)
	const cropTop = clamp(top - padding, 0, height)
	const cropRight = clamp(right + padding, 0, width - 1)
	const cropBottom = clamp(bottom + padding, 0, height - 1)

	const cropWidth = cropRight - cropLeft + 1
	const cropHeight = cropBottom - cropTop + 1

	const canvas = document.createElement('canvas')
	canvas.width = cropWidth
	canvas.height = cropHeight
	const ctx2 = canvas.getContext('2d')!
	ctx2.drawImage(source, -cropLeft, -cropTop)
	return canvas
}

export default function SignaturePadCanvas() {
	const containerRef = useRef<HTMLDivElement | null>(null)
	const canvasRef = useRef<HTMLCanvasElement | null>(null)
	const padRef = useRef<SignaturePad | null>(null)
	const [strokeColor, setStrokeColor] = useState<string>('#111111')
	const [backgroundColor, setBackgroundColor] = useState<string>('transparent')
	const [thickness, setThickness] = useState<number>(2.5)
	const dpr = useDevicePixelRatio()

	// Update ink color when background changes to transparent and using default dark color
	useEffect(() => {
		if (backgroundColor === 'transparent' && strokeColor === '#111111') {
			setStrokeColor('#ffffff')
		} else if (backgroundColor !== 'transparent' && strokeColor === '#ffffff') {
			// Revert to dark color when switching from transparent background
			setStrokeColor('#111111')
		}
	}, [backgroundColor, strokeColor])

	const minWidth = useMemo(() => Math.max(0.5, thickness * 0.6), [thickness])
	const maxWidth = useMemo(() => Math.max(1.5, thickness * 1.6), [thickness])

	useEffect(() => {
		if (!canvasRef.current) return
		padRef.current = new SignaturePad(canvasRef.current, {
			minWidth,
			maxWidth,
			penColor: strokeColor,
			backgroundColor: 'rgba(0,0,0,0)'
		})
		return () => {
			padRef.current?.off()
			padRef.current = null
		}
	// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [])

	useEffect(() => {
		if (!padRef.current) return
		padRef.current.minWidth = minWidth
		padRef.current.maxWidth = maxWidth
	}, [minWidth, maxWidth])

	useEffect(() => {
		if (padRef.current) {
			padRef.current.penColor = strokeColor
		}
	}, [strokeColor])

	const resizeCanvas = () => {
		const canvas = canvasRef.current
		const container = containerRef.current
		if (!canvas || !container) return

		const previousWidth = canvas.width
		const previousHeight = canvas.height
		const data = (padRef.current?.toData() || []) as unknown as SigPointGroup[]

		const cssWidth = container.clientWidth
		const isPhone = cssWidth < 480
		const minHeight = isPhone ? 360 : 300
		const targetRatio = isPhone ? 0.75 : 0.5
		const baseHeight = Math.floor(cssWidth * targetRatio)
		const maxPhoneHeight = isPhone ? Math.floor(window.innerHeight * 0.6) : Number.POSITIVE_INFINITY
		const cssHeight = Math.max(minHeight, Math.min(baseHeight, maxPhoneHeight))

		const ratio = Math.max(3, dpr)
		canvas.width = Math.floor(cssWidth * ratio)
		canvas.height = Math.floor(cssHeight * ratio)
		canvas.style.width = cssWidth + 'px'
		canvas.style.height = cssHeight + 'px'

		const ctx = canvas.getContext('2d')!
		ctx.scale(ratio, ratio)

		if (padRef.current) {
			padRef.current.clear()
			if (data.length && previousWidth && previousHeight && (previousWidth !== canvas.width || previousHeight !== canvas.height)) {
				const scaleX = canvas.width / previousWidth
				const scaleY = canvas.height / previousHeight
				const scaled: SigPointGroup[] = data.map(stroke => ({
					...stroke,
					points: stroke.points.map(p => ({ x: p.x * scaleX, y: p.y * scaleY, pressure: p.pressure }))
				}))
				// signature_pad's @types may miss fromData; coerce for now with explicit type
				;(padRef.current as SignaturePadWithFromData).fromData(scaled)
			} else {
				;(padRef.current as SignaturePadWithFromData).fromData(data)
			}
		}
	}

	useEffect(() => {
		resizeCanvas()
		const onResize = () => resizeCanvas()
		window.addEventListener('resize', onResize)
		return () => window.removeEventListener('resize', onResize)
	// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [dpr])

	const handleClear = () => padRef.current?.clear()

	const handleUndo = () => {
		if (!padRef.current) return
		const data = padRef.current.toData() as unknown as SigPointGroup[]
		if (!data.length) return
		data.pop()
		;(padRef.current as SignaturePadWithFromData).fromData(data)
	}

	const exportCanvas = (format: ExportFormat) => {
		const canvas = canvasRef.current
		if (!canvas || !padRef.current) return
		if (padRef.current.isEmpty()) return

		const trimmed = trimCanvas(canvas)

		if (format === 'png') {
			if (backgroundColor !== 'transparent') {
				// draw onto a solid background if selected
				const bg = document.createElement('canvas')
				bg.width = trimmed.width
				bg.height = trimmed.height
				const bgCtx = bg.getContext('2d')!
				bgCtx.fillStyle = backgroundColor
				bgCtx.fillRect(0, 0, bg.width, bg.height)
				bgCtx.drawImage(trimmed, 0, 0)
				triggerDownload(bg.toDataURL('image/png'), 'signature.png')
				return
			}
			triggerDownload(trimmed.toDataURL('image/png'), 'signature.png')
			return
		}

		if (format === 'pdf') {
			import('jspdf').then(({ jsPDF }) => {
				const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' })
				const pageWidth = doc.internal.pageSize.getWidth()
				const pageHeight = doc.internal.pageSize.getHeight()
				const margin = 10

				// convert px to mm assuming 96 dpi
				const pxToMm = (px: number) => (px * 25.4) / 96
				const imgWmm = pxToMm(trimmed.width)
				const imgHmm = pxToMm(trimmed.height)

				const maxW = pageWidth - margin * 2
				const maxH = pageHeight - margin * 2
				const fit = Math.min(maxW / imgWmm, maxH / imgHmm)
				const w = imgWmm * fit
				const h = imgHmm * fit
				const x = (pageWidth - w) / 2
				const y = (pageHeight - h) / 2

				const dataUrl = trimmed.toDataURL('image/png')
				doc.addImage(dataUrl, 'PNG', x, y, w, h, undefined, 'FAST')
				doc.save('signature.pdf')
			})
		}
	}

	function triggerDownload(dataUrl: string, filename: string) {
		const link = document.createElement('a')
		link.href = dataUrl
		link.download = filename
		document.body.appendChild(link)
		link.click()
		document.body.removeChild(link)
	}

	return (
		<div className="sig-root" style={{ '--sig-bg': backgroundColor } as CSSProperties}>
			<div className="sig-card">
				<header className="sig-header">
					<h1 className="sig-title">eSign</h1>
					<p className="sig-subtitle">Draw your signature and export as PNG or PDF</p>
				</header>
				<div className="sig-canvas-wrap" ref={containerRef}>
					<canvas ref={canvasRef} className="sig-canvas" />
					<div className="sig-grid" aria-hidden="true" />
				</div>
				<div className="sig-toolbar">
					<div className="sig-row">
						<button onClick={handleUndo} className="sig-btn">Undo</button>
						<button onClick={handleClear} className="sig-btn btn-danger">Clear</button>
						<div className="sig-spacer" />
						<label className="sig-field">
							<span>Background</span>
							<select value={backgroundColor} onChange={e => setBackgroundColor(e.target.value)}>
								<option value="transparent">Transparent</option>
								<option value="#ffffff">White</option>
								<option value="#f0f0f0">Light Gray</option>
								<option value="#000000">Black</option>
							</select>
						</label>
						<label className="sig-field">
							<span>Thickness</span>
							<input type="range" min={1} max={6} step={0.1} value={thickness} onChange={e => setThickness(parseFloat(e.target.value))} />
						</label>
						<label className="sig-field">
							<span>Ink</span>
							<input type="color" value={strokeColor} onChange={e => setStrokeColor(e.target.value)} />
						</label>
					</div>
					<div className="sig-row">
						<button onClick={() => exportCanvas('png')} className="sig-btn btn-primary">Download PNG</button>
						<button onClick={() => exportCanvas('pdf')} className="sig-btn btn-primary">Download PDF</button>
					</div>
				</div>
			</div>
			<footer className="sig-footer">No data leaves your device. Everything runs locally.</footer>
		</div>
	)
}


