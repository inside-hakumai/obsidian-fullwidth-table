import { App, Plugin, PluginManifest } from 'obsidian'
import { v4 as uuidv4 } from 'uuid'

import './styles.css'

type TableId = string

export default class FullwidthTablePlugin extends Plugin {
    private tableMap = new TableMap()

    private viewResizeObserver = new ResizeObserver((entries) => {
        entries.forEach((entry) => {
            const viewElement = entry.target
            const isValidElement =
                viewElement instanceof HTMLElement &&
                viewElement.tagName === 'DIV' &&
                viewElement.classList.contains('view-content')
            if (!isValidElement) {
                return
            }
            this.storeViewSize(viewElement)
        })
    })

    private tableWidgetResizeObserver = new ResizeObserver((entries) => {
        // entriesは配列で返ってくるが、実態としては1つの要素しか入り得ないはず
        entries.forEach((entry) => {
            const tableWidget = entry.target as HTMLElement
            this.setTableWrapperWidth(tableWidget)
        })
    })

    private tableWidgetMutationObserver = new MutationObserver((mutations) => {
        const mutated = new Set(
            mutations
                .map((mutation) => mutation.target as HTMLElement)
                .filter((node) => node.classList.contains('cm-table-widget')),
        )
        mutated.forEach((tableWidget) => {
            this.setTableWrapperWidth(tableWidget)
        })
    })

    constructor(app: App, manifest: PluginManifest) {
        super(app, manifest)

        this.tableMap.addChangeEventListener('tableWrapperWidth', (tableId, width) => {
            console.log(`tableWrapperWidth of ${tableId} updated: ${width}`)
        })

        this.tableMap.addChangeEventListener('leftGap', (tableId, left) => {
            console.log(`leftGap of ${tableId} updated: ${left}`)
            const tableWidgetElement = document.querySelector(
                `div.cm-table-widget[data-plugin-fullwidth-table-id="${tableId}"]`,
            )
            if (!tableWidgetElement) {
                return
            }
            if (!(tableWidgetElement instanceof HTMLElement)) {
                throw new Error(`tableWidgetElement is not an HTMLElement: ${tableId}`)
            }

            tableWidgetElement.style.setProperty('--plugin-fullwidth-table-left-gap', `${left}px`)
        })

        this.tableMap.addChangeEventListener('viewWidth', (width) => {
            document.body.style.setProperty('--plugin-fullwidth-table-view-width', `${width}px`)
        })
    }

    override async onload() {
        this.app.workspace.onLayoutReady(() => {
            const viewContentElement = document.querySelector('.view-content')
            console.log(viewContentElement)
            if (!viewContentElement || !(viewContentElement instanceof HTMLElement)) {
                throw new Error('viewContentElement not found')
            }
            this.viewResizeObserver.observe(viewContentElement)
            this.storeViewSize(viewContentElement)

            const cmContentElement = document.querySelector('.cm-content')
            console.log(cmContentElement)
            if (!cmContentElement) {
                throw new Error('cmContentElement not found')
            }

            const tableInsertionObserver = new MutationObserver((mutations) => {
                console.log(mutations)
                const addedTableWidgets = new Set(
                    mutations
                        .filter((mutation) => mutation.type === 'childList')
                        .flatMap((mutation) => Array.from(mutation.addedNodes))
                        .map((node) => node as HTMLElement)
                        .filter((node) => node.classList.contains('cm-table-widget')),
                )

                console.log(addedTableWidgets)

                addedTableWidgets.forEach((tableWidgetElement) => this.initTable(tableWidgetElement as HTMLElement))
            })

            tableInsertionObserver.observe(cmContentElement, {
                childList: true,
                subtree: false,
                attributes: false,
            })

            this.init()
        })

        // this.registerMarkdownPostProcessor(

        // 	(element: HTMLElement, context: MarkdownPostProcessorContext) => {
        // 		console.debug(element, element.tagName, element.classList);

        // 		const isTableWrapper =
        // 			element.tagName === "DIV" &&
        // 			element.classList.contains("el-table");
        // 		if (isTableWrapper) {
        // 			const tables = element.querySelectorAll("table");
        // 			tables.forEach(this.processTable);
        // 			return;
        // 		}

        // 		const isTableCellWrapper =
        // 			element.tagName === "DIV" &&
        // 			element.classList.contains("table-cell-wrapper");
        // 		if (isTableCellWrapper) {
        // 			const table = element.closest("table.table-editor");
        // 			if (table && table instanceof HTMLTableElement) {
        // 				this.processTable(table);
        // 			}
        // 		}
        // 	}
        // );
    }

    override onunload() {
        // クリーンアップ処理があればここに記述
        // 今回は registerMarkdownPostProcessor が自動で解除されるので基本不要
        console.log('FullwidthTablePlugin: Unloading plugin')
    }

    private init() {
        const tableWidgetElements = Array.from(document.querySelectorAll('div.cm-table-widget'))
        console.log(`Found ${tableWidgetElements.length} div.cm-table-widget elements`)
        tableWidgetElements.forEach((tableWidgetElement) => this.initTable(tableWidgetElement as HTMLElement))
    }

    private initTable(tableWidgetElement: HTMLElement) {
        const tableId = uuidv4()
        tableWidgetElement.dataset.pluginFullwidthTableId = tableId

        this.setTableWrapperWidth(tableWidgetElement)
        this.tableWidgetResizeObserver.observe(tableWidgetElement)
        this.tableWidgetMutationObserver.observe(tableWidgetElement, {
            childList: true,
            subtree: false,
            attributes: false,
        })
    }

    private setTableWrapperWidth(tableWidgetElement: HTMLElement) {
        const tableId = tableWidgetElement.dataset.pluginFullwidthTableId
        if (!tableId) {
            throw new Error('tableId not found in dataset')
        }

        const tableWrapperElement = tableWidgetElement.querySelector('div.table-wrapper')
        if (!tableWrapperElement || !(tableWrapperElement instanceof HTMLElement)) {
            throw new Error('tableWrapperElement not found')
        }

        const width = tableWrapperElement.clientWidth
        this.tableMap.setTableWrapperWidth(tableId, width)
    }

    /**
     * @param viewElement div.view-content の要素
     */
    private storeViewSize(viewElement: HTMLElement) {
        const clientWidth = viewElement.clientWidth // padding含む

        const scroller = viewElement.querySelector('div.cm-scroller')
        if (!scroller || !(scroller instanceof HTMLElement)) {
            throw new Error('scroller not found')
        }

        console.log(scroller)
        const computedStyle = window.getComputedStyle(scroller)
        const padding = parseFloat(computedStyle.paddingLeft) + parseFloat(computedStyle.paddingRight)
        const contentWidth = clientWidth - padding

        this.tableMap.setViewWidth(contentWidth)
        console.debug(`Detected view width: ${contentWidth}`)
    }

    // private processTable(table: HTMLTableElement) {
    // 	console.log("Found table element: ", table);
    // 	// テーブル要素を直接含む親要素 (通常は <p> や <div>) を探す
    // 	// もしくはテーブル自体にクラスを付与しても良いが、
    // 	// スクロールコンテナとして親要素を使う方が一般的
    // 	// ここでは、簡単のためテーブルの直接の親にクラスを付与する
    // 	const parent = table.parentElement;
    // 	console.log(parent, table.closest("div"));
    // 	if (parent) {
    // 		// 既にクラスが付与されているかチェック (重複付与防止)
    // 		if (
    // 			!parent.classList.contains(
    // 				"fullwidth-table-container"
    // 			)
    // 		) {
    // 			parent.classList.add("fullwidth-table-container");
    // 			// デバッグ用にログ出力 (開発中は便利)
    // 			console.log(
    // 				"FullwidthTablePlugin: Applied class to table container"
    // 			);
    // 		}
    // 	}
    // }
}

type ChangeEventListeners = {
    tableWrapperWidth: ((tableId: TableId, width: number) => void)[]
    leftGap: ((tableId: TableId, width: number) => void)[]
    viewWidth: ((width: number) => void)[]
}

class TableMap {
    /** Obsidianのファイル内容の表示領域（View）の横幅（padding除く） */
    private viewWidth: number | undefined = undefined
    /** テーブル要素のラッパー要素（div.table-wrapper）の横幅 */
    private tableWrapperWidth: Record<TableId, number> = {}
    /** テーブル要素を通常の編集領域から左方向に何pxずらすか */
    private leftGap: Record<TableId, number> = {}

    private changeEventListeners: ChangeEventListeners = {
        tableWrapperWidth: [],
        leftGap: [],
        viewWidth: [],
    }

    setTableWrapperWidth(tableId: TableId, width: number) {
        const isValueChanged = this.tableWrapperWidth[tableId] !== width

        if (isValueChanged) {
            this.tableWrapperWidth[tableId] = width
            for (const callback of this.changeEventListeners['tableWrapperWidth']) {
                callback(tableId, width)
            }
            this.calcLeftGap(tableId)
        }
    }

    setViewWidth(width: number) {
        this.viewWidth = width
        for (const callback of this.changeEventListeners['viewWidth']) {
            callback(width)
        }

        for (const tableId of Object.keys(this.leftGap)) {
            this.calcLeftGap(tableId)
        }
    }

    /**
     * TableWidget要素を左方向に何pxずらすかを計算する
     *
     * - TableWrapper要素の幅が編集領域の1行の横幅よりも小さい場合
     *     => ずらす必要はないので0を返す
     * - TableWrapper要素の幅が編集領域の1行の横幅よりも大きく、viewの横幅よりも小さい場合
     *     => TableWrapper要素の横幅とviewの横幅の差の半分だけずらす
     * - TableWrapper要素の幅がviewの横幅よりも大きい場合
     *     => viewの横幅いっぱいに表示し、それよりも超過する分はスクロールできるようにするので、viewの横幅と編集領域の横幅の差の半分だけずらす
     */
    private calcLeftGap(tableId: TableId) {
        const tableWrapperWidth = this.tableWrapperWidth[tableId]
        if (tableWrapperWidth === undefined) {
            throw new Error(`tableWrapperWidth not found in tableMap: ${tableId}`)
        }
        if (this.viewWidth === undefined) {
            throw new Error(`viewWidth is not initialized`)
        }

        const lineWidth = document.querySelector('.cm-contentContainer')?.clientWidth
        if (lineWidth === undefined) {
            throw new Error(`lineWidth is not initialized`)
        }

        let newLeftGap: number
        if (tableWrapperWidth < lineWidth) {
            newLeftGap = 0
        } else if (lineWidth < tableWrapperWidth && tableWrapperWidth < this.viewWidth) {
            newLeftGap = (tableWrapperWidth - lineWidth) / 2
        } else {
            newLeftGap = (this.viewWidth - lineWidth) / 2
        }

        this.leftGap[tableId] = newLeftGap
        for (const callback of this.changeEventListeners['leftGap']) {
            callback(tableId, newLeftGap)
        }
    }

    addChangeEventListener<T extends keyof ChangeEventListeners>(event: T, callback: ChangeEventListeners[T][number]) {
        if (!this.changeEventListeners[event]) {
            this.changeEventListeners[event] = []
        }
        this.changeEventListeners[event].push(callback as any)
    }
}
