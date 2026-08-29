#!/usr/bin/env node

import { Context } from '@daoai/cordis'
import { pathToFileURL } from 'node:url'
import Loader from '@daoai/cordis-plugin-loader'

const ctx = new Context()
ctx.baseUrl = pathToFileURL(process.cwd()).href + '/'

await ctx.plugin(Loader)
await ctx.loader.create({
  name: '@daoai/cordis-plugin-include',
  config: {
    path: './cordis.yml',
  },
})
