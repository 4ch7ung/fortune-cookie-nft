import { Cell } from "@ton/core";

const OFF_CHAIN_CONTENT_PREFIX = 0x01

export function flattenSnakeCell(cell: Cell) {
    let c: Cell|null = cell

    let res = Buffer.alloc(0)

    while (c) {
        let cs = c.beginParse()
        if (cs.remainingBits % 8 !== 0) {
            throw Error('Number remaining of bits is not multiply of 8');
        }
        let data = cs.loadBuffer(cs.remainingBits / 8)
        res = Buffer.concat([res, data])
        c = c.refs[0]
    }

    return res
}

function bufferToChunks(buff: Buffer, chunkSize: number) {
    let chunks: Buffer[] = []
    while (buff.byteLength > 0) {
        chunks.push(buff.subarray(0, chunkSize))
        buff = buff.subarray(chunkSize)
    }
    return chunks
}

export function makeSnakeCell(data: Buffer) {
    let chunks = bufferToChunks(data, 127)
    let rootCell = new Cell()
    let curCell = rootCell

    for (let i = 0; i < chunks.length; i++) {
        let chunk = chunks[i]

        curCell.asBuilder().storeBuffer(chunk)

        if (chunks[i+1]) {
            let nextCell = new Cell()
            curCell.refs.push(nextCell)
            curCell = nextCell
        }
    }

    return rootCell
}

export function encodeOffChainContent(content: string) {
    let data = Buffer.from(content)
    let offChainPrefix = Buffer.from([OFF_CHAIN_CONTENT_PREFIX])
    data = Buffer.concat([offChainPrefix, data])
    return makeSnakeCell(data)
}

export function decodeOffChainContent(content: Cell) {
    let data = flattenSnakeCell(content)

    let prefix = data[0]
    if (prefix !== OFF_CHAIN_CONTENT_PREFIX) {
        throw new Error(`Unknown content prefix: ${prefix.toString(16)}`)
    }
    return data.subarray(1).toString()
}