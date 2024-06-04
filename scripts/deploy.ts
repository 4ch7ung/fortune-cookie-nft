import { toNano } from '@ton/core';
import { FortuneCookieNftCollection } from '../wrappers/FortuneCookieNftCollection';
import { compile, NetworkProvider } from '@ton/blueprint';

export async function run(provider: NetworkProvider) {
    const randomTicketNftCollection = provider.open(await FortuneCookieNftCollection.createFromConfig({}, await compile('FortuneCookieNftCollection')));

    await randomTicketNftCollection.sendDeploy(provider.sender(), toNano('0.05'));

    await provider.waitForDeploy(randomTicketNftCollection.address);

    // run methods on `randomTicketNftCollection`
}
