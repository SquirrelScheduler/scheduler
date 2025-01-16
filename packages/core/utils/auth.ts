import {basicAuth} from "hono/dist/types/middleware/basic-auth";
import {orThrow} from "./general";
import {Context} from "hono";

export type Bindings = {
    SQUIRREL_USERNAME: string;
    SQUIRREL_API_KEY: string;
}

export const simpleApiKeyAuth = async (c:Context) => basicAuth({
    username: orThrow(c.env.SQUIRREL_USERNAME, 'SQUIRREL_USERNAME not found'),
    password: orThrow(c.env.SQUIRREL_API_KEY, 'SQUIRREL_API_KEY not found'),
});