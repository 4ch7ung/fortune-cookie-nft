import { Address, beginCell, Cell, Dictionary, Slice, storeStateInit } from "@ton/core";
import { encodeOffChainContent } from "../utils/nftContentUtils";

export type RoyaltyParams = {
    royaltyFactor: number
    royaltyBase: number
    royaltyAddress: Address
}

export type FortuneCookieNftCollectionData = {
    ownerAddress: Address,
    nextItemIndex: number | bigint
    collectionContent: string
    commonContent: string
    nftItemCode: Cell
    royaltyParams: RoyaltyParams
}

// default#_ royalty_factor:uint16 royalty_base:uint16 royalty_address:MsgAddress = RoyaltyParams;
// storage#_ owner_address:MsgAddress next_item_index:uint64
//           ^[collection_content:^Cell common_content:^Cell]
//           nft_item_code:^Cell
//           royalty_params:^RoyaltyParams
//           = Storage;

export function buildNftCollectionDataCell(data: FortuneCookieNftCollectionData) {
    let dataCell = beginCell();
    
    dataCell.storeAddress(data.ownerAddress);
    dataCell.storeUint(data.nextItemIndex, 64);

    let collectionContent = encodeOffChainContent(data.collectionContent);

    let commonContent = beginCell()
        .storeBuffer(Buffer.from(data.commonContent))
        .endCell();
    
    let contentCell = beginCell()
        .storeRef(collectionContent)
        .storeRef(commonContent)
        .endCell();
    
    dataCell.storeRef(contentCell);
    dataCell.storeRef(data.nftItemCode);

    let royaltyCell = beginCell()
        .storeUint(data.royaltyParams.royaltyFactor, 16)
        .storeUint(data.royaltyParams.royaltyBase, 16)
        .storeAddress(data.royaltyParams.royaltyAddress)
        .endCell();

    dataCell.storeRef(royaltyCell)

    return dataCell.endCell();
}

export function buildNftCollectionStateInit(conf: FortuneCookieNftCollectionData, codeCell: Cell) {
    let dataCell = buildNftCollectionDataCell(conf)
    
    let stateInit = {
        code: codeCell,
        data: dataCell
    };

    let stateInitCell = beginCell();
    storeStateInit(stateInit)(stateInitCell);

    return {
        stateInitCell: stateInitCell.endCell(),
        stateInit
    }
}

export const OperationCodes = {
    Mint: 1,
    BatchMint: 2,
    ChangeOwner: 3,
    EditContent: 4,
    GetRoyaltyParams: 0x693d3950,
    GetRoyaltyParamsResponse: 0xa8cb00ad
}

export type FortuneCookieCollectionMintItemInput = {
    passAmount: bigint
    index: number
    ownerAddress: Address
    lowerBound: number
    upperBound: number
    content: string
}

export const Queries = {
    mint: (params: { queryId?: number, itemInput: FortuneCookieCollectionMintItemInput }) => {
        let msgBody = beginCell()
            .storeUint(OperationCodes.Mint, 32)
            .storeUint(params.queryId || 0, 64)
            .storeUint(params.itemInput.index, 64)
            .storeCoins(params.itemInput.passAmount);

        let itemContent = beginCell()
            .storeBuffer(Buffer.from(params.itemInput.content))
            .endCell();

        let nftItemMessage = beginCell()
            .storeAddress(params.itemInput.ownerAddress)
            .storeUint(params.itemInput.lowerBound, 32)
            .storeUint(params.itemInput.upperBound, 32)
            .storeRef(itemContent)
            .endCell();

        msgBody.storeRef(nftItemMessage);

        return msgBody.endCell();
    },
    batchMint: (params: { queryId?: number, items: FortuneCookieCollectionMintItemInput[] }) => {
        if (params.items.length > 250) {
            throw new Error('Too long list');
        }

        let dict: Dictionary<number, Cell> = Dictionary.empty();

        const itemsFactory = (item: FortuneCookieCollectionMintItemInput): Cell => {
            let itemContent = beginCell()
                .storeBuffer(Buffer.from(item.content))
                .endCell();

            let nftItemMessage = beginCell()
                .storeAddress(item.ownerAddress)
                .storeUint(item.lowerBound, 32)
                .storeUint(item.upperBound, 32)
                .storeRef(itemContent)
                .endCell();

            return nftItemMessage;
        }

        for (let item of params.items) {
            dict.set(item.index, itemsFactory(item));
        }

        let msgBody = beginCell()
            .storeUint(OperationCodes.BatchMint, 32)
            .storeUint(params.queryId || 0, 64)
            .storeDict(dict, Dictionary.Keys.Int(32), Dictionary.Values.Cell());

        return msgBody.endCell();
    },
    changeOwner: (params: { queryId?: number, newOwner: Address}) => {
        let msgBody = beginCell()
            .storeUint(OperationCodes.ChangeOwner, 32)
            .storeUint(params.queryId || 0, 64)
            .storeAddress(params.newOwner);
        return msgBody.endCell();
    },
    getRoyaltyParams: (params: { queryId?: number }) => {
        let msgBody = beginCell()
            .storeUint(OperationCodes.GetRoyaltyParams, 32)
            .storeUint(params.queryId || 0, 64);
        return msgBody.endCell();
    },
    editContent: (params: { queryId?: number,  collectionContent: string, commonContent: string,  royaltyParams: RoyaltyParams  }) => {
        let royaltyCell = beginCell()
            .storeUint(params.royaltyParams.royaltyFactor, 16)
            .storeUint(params.royaltyParams.royaltyBase, 16)
            .storeAddress(params.royaltyParams.royaltyAddress);

        let collectionContent = encodeOffChainContent(params.collectionContent);

        let commonContent = beginCell()
            .storeBuffer(Buffer.from(params.commonContent));

        let contentCell = beginCell()
            .storeRef(collectionContent)
            .storeRef(commonContent);

        let msgBody = beginCell()
            .storeUint(OperationCodes.EditContent, 32)
            .storeUint(params.queryId || 0, 64)
            .storeRef(contentCell)
            .storeRef(royaltyCell);

        return msgBody.endCell();
    }
}
