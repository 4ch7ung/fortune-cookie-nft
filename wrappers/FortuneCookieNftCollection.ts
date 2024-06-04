import { Address, beginCell, Cell, Contract, contractAddress, ContractProvider, Sender, SendMode, toNano } from '@ton/core';
import { decodeOffChainContent } from '../utils/nftContentUtils';
import { RoyaltyParams, FortuneCookieNftCollectionData, FortuneCookieCollectionMintItemInput, Queries, buildNftCollectionStateInit } from './FortuneCookieNftCollection.data';


export class FortuneCookieNftCollection implements Contract {
    constructor(readonly address: Address, readonly init?: { code: Cell; data: Cell }) {}

    static createFromAddress(address: Address) {
        return new FortuneCookieNftCollection(address);
    }

    static async createFromConfig(config: FortuneCookieNftCollectionData, code: Cell, workchain = 0) {
        const { stateInit } = buildNftCollectionStateInit(config, code);
        return new FortuneCookieNftCollection(contractAddress(workchain, stateInit), stateInit);
    }

    async sendDeploy(provider: ContractProvider, via: Sender, value: bigint) {
        await provider.internal(via, {
            value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: beginCell().endCell(),
        });
    }

    //
    // Get methods
    //

    async getCollectionData(provider: ContractProvider) {
        const { stack } = await provider.get('get_collection_data', []);
        
        return {
            nextItemId: stack.readNumber(),
            collectionContent: decodeOffChainContent(stack.readCell()),
            ownerAddress: stack.readAddress()
        }
    }

    async getNftAddressByIndex(provider: ContractProvider, index: number) {
        const { stack } = await provider.get('get_nft_address_by_index', [{
            type: 'int',
            value: BigInt(index)
        }])
        return stack.readAddress()
    }

    async getRoyaltyParams(provider: ContractProvider): Promise<RoyaltyParams> {
        let { stack } = await provider.get('royalty_params', [])

        return {
            royaltyFactor: stack.readNumber(),
            royaltyBase: stack.readNumber(),
            royaltyAddress: stack.readAddress()
        }
    }

    async getNftContent(provider: ContractProvider, index: number, nftIndividualContent: Cell): Promise<string> {
        let { stack } = await provider.get('get_nft_content', [
            { type: 'int', value: BigInt(index) },
            { type: 'cell', cell: nftIndividualContent }
        ])

        return decodeOffChainContent(stack.readCell())
    }

    //
    // Internal messages
    //

    async sendDeployNewNft(
        provider: ContractProvider, 
        sender: Sender, 
        value: bigint, 
        params: { queryId?: number, itemInput: FortuneCookieCollectionMintItemInput }
    ) {
        let msgBody = Queries.mint(params)
        
        return await provider.internal(sender, {
            value: value,
            bounce: false,
            body: msgBody
        });
    }

    async sendBatchDeployNft(
        provider: ContractProvider,
        sender: Sender,
        value: bigint, 
        params: { queryId?: number, items: FortuneCookieCollectionMintItemInput[] }
    ) {
        let msgBody = Queries.batchMint(params)

        return await provider.internal(sender, {
            value: value,
            bounce: false,
            body: msgBody
        });
    }

    async sendChangeOwner(
        provider: ContractProvider,
        sender: Sender,
        newOwner: Address
    ) {
        let msgBody = Queries.changeOwner({ newOwner })

        return await provider.internal(sender, {
            value: toNano(0.05),
            bounce: false,
            body: msgBody
        });
    }

    async sendGetRoyaltyParams(
        provider: ContractProvider,
        sender: Sender
    ) {
        let msgBody = Queries.getRoyaltyParams({})

        return await provider.internal(sender, {
            value: toNano(0.05),
            bounce: false,
            body: msgBody
        });
    }

    /* not implemented, contract is not editable */
    async sendEditContent(
        provider: ContractProvider,
        sender: Sender,
        params: { queryId?: number,  collectionContent: string, commonContent: string,  royaltyParams: RoyaltyParams }
    ) {
        let msgBody = Queries.editContent(params)

        return await provider.internal(sender, {
            value: toNano(0.05),
            bounce: false,
            body: msgBody
        });
    }
}
