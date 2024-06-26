import { Address, beginCell, Cell, Contract, contractAddress, ContractProvider, Sender, SendMode, toNano, storeStateInit } from '@ton/core';
import { encodeOffChainContent } from '../utils/nftContentUtils';

// ;; storage scheme
// ;; mint_config#_ price:Grams
// ;;               lower_bound:uint32
// ;;               upper_bound:uint32
// ;;               content:^Cell
// ;;               = MintConfig;
// ;; storage#_ owner_address:MsgAddress
// ;;           collection_address:MsgAddress
// ;;           pass_value:Grams
// ;;           mint_configA:^MintConfig
// ;;           mint_configB:^MintConfig
// ;;           mint_configC:^MintConfig
// ;;           mint_configD:^MintConfig
// ;;           = Storage;
export type FortuneCookieMintConfig = {
  price: bigint,
  lowerBound: number,
  upperBound: number,
  content: string
}
export type FortuneCookieMinterData = {
  ownerAddress: Address,
  collectionAddress: Address,
  passValue: bigint,
  mintConfigA: FortuneCookieMintConfig,
  mintConfigB: FortuneCookieMintConfig,
  mintConfigC: FortuneCookieMintConfig,
  mintConfigD: FortuneCookieMintConfig
};

function cellFromMintConfig(config: FortuneCookieMintConfig) {
  return beginCell()
    .storeCoins(config.price)
    .storeUint(config.lowerBound, 32)
    .storeUint(config.upperBound, 32)
    .storeRef(encodeOffChainContent(config.content))
    .endCell();
}

export function buildCookieMinterStateInit(conf: FortuneCookieMinterData, codeCell: Cell) {
  let dataCell = beginCell()
    .storeAddress(conf.ownerAddress)
    .storeAddress(conf.collectionAddress)
    .storeCoins(conf.passValue)
    .storeRef(cellFromMintConfig(conf.mintConfigA))
    .storeRef(cellFromMintConfig(conf.mintConfigB))
    .storeRef(cellFromMintConfig(conf.mintConfigC))
    .storeRef(cellFromMintConfig(conf.mintConfigD))
    .endCell();
  
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

export enum OperationCodes {
  mintCollectionA = 0xd3c8fc5a,
  mintCollectionB = 0x4ac1ade0,
  mintCollectionC = 0x3dc69d76,
  mintCollectionD = 0xa3a208d5,
  collectProfits = 0xb726fb4d
}

export enum MintCollection {
  A = OperationCodes.mintCollectionA,
  B = OperationCodes.mintCollectionB,
  C = OperationCodes.mintCollectionC,
  D = OperationCodes.mintCollectionD
}

const nftMinStorage = 0.05;
const gasPerItem = 0.015;

export class FortuneCookieMinter implements Contract {
  constructor(readonly address: Address, readonly init?: { code: Cell; data: Cell }) {}
  
  static createFromAddress(address: Address) {
    return new FortuneCookieMinter(address);
  }
  
  static createFromConfig(config: FortuneCookieMinterData, code: Cell, workchain = 0) {
    const { stateInit } = buildCookieMinterStateInit(config, code);
    return new FortuneCookieMinter(contractAddress(workchain, stateInit), stateInit);
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

  async getPrices(provider: ContractProvider) {
    const { stack } = await provider.get('get_prices', []);

    const gas = stack.readBigNumber();
    const passValue = stack.readBigNumber();
    const mintCollectionA = stack.readBigNumber();
    const mintCollectionB = stack.readBigNumber();
    const mintCollectionC = stack.readBigNumber();
    const mintCollectionD = stack.readBigNumber();
    
    return {
      expenses: gas + passValue,
      mintCollectionA,
      mintCollectionB,
      mintCollectionC,
      mintCollectionD,
      totalMintCollectionA: mintCollectionA + gas + passValue,
      totalMintCollectionB: mintCollectionB + gas + passValue,
      totalMintCollectionC: mintCollectionC + gas + passValue,
      totalMintCollectionD: mintCollectionD + gas + passValue
    }
  }

  ///
  /// Test messages
  ///

  async sendFakeOpMessage(
    provider: ContractProvider,
    sender: Sender,
    op: number
  ) {
    const msgBody = beginCell()
      .storeUint(op, 32)
      .storeUint(0, 64)
      .endCell();
    
    return await provider.internal(sender, {
      value: toNano(0.015),
      body: msgBody,
      sendMode: SendMode.PAY_GAS_SEPARATELY
    });
  }
  
  //
  // Internal messages
  //
  
  async sendMintCollection(
    provider: ContractProvider,
    sender: Sender,
    value: bigint,
    collection: MintCollection,
    queryId?: number
  ) {
    const totalValue = value + toNano(gasPerItem);
    const msgBody = beginCell()
      .storeUint(collection, 32)
      .storeUint(queryId || 0, 64)
      .endCell();
    
    return await provider.internal(sender, {
      value: totalValue,
      body: msgBody,
      sendMode: SendMode.PAY_GAS_SEPARATELY
    });
  }

  async sendCollectProfits(
    provider: ContractProvider,
    sender: Sender
  ) {
    const msgBody = beginCell()
      .storeUint(OperationCodes.collectProfits, 32)
      .storeUint(0, 64)
      .endCell();
    
    return await provider.internal(sender, {
      value: toNano(0.015),
      body: msgBody,
      sendMode: SendMode.PAY_GAS_SEPARATELY
    });
  }

  async getOwnerAddress(provider: ContractProvider): Promise<Address | null> {
    const { state } = await provider.getState();
    if (state.type !== 'active') {
      return null;
    }

    const data = state.data!;
    const reader = Cell.fromBoc(data)[0].beginParse();
  
    return reader.loadAddress();
  }
}
