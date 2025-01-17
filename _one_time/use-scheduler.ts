import {SScheduler} from "../packages/core/src";
import {SquirrelDrizzleAdapter} from "../packages/drizzle-adapter/src";
import {drizzle} from "drizzle-orm/libsql";
import {tursoConnectionSecrets} from "./turso/secrets";

// Example usage
// @ts-ignore
(async () => {
    const dbAdapter = SquirrelDrizzleAdapter(drizzle({ connection: tursoConnectionSecrets }));
    const scheduler = new SScheduler(dbAdapter);

    await scheduler
        .add({
            payload: {
                id: "email.send.welcome",
                args: { to: "sabaniflorian@gmail.com" },
            },
            scheduledAt: new Date(Date.now() + 2000), // 2 seconds from now
        })
        .add({
            payload: {
                id: "email.send.followup",
                args: { to: "sabaniflorian@gmail.com" },
            },
            scheduledAt: new Date(Date.now() + 5000), // 5 seconds from now
        })
        .schedule();

    console.log("Waiting 4 seconds...");
    await sleep(4000);
    const tasks = await scheduler.sync();

    console.log("Waiting another 6 seconds...");
    await sleep(6000);
    await scheduler.sync();
})();


function sleep(ms: number) {
    // @ts-ignore
    return new Promise(resolve => setTimeout(resolve, ms));
}