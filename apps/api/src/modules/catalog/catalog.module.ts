import { Module } from "@nestjs/common";
import { CatalogService } from "./application/catalog.service";
import { CatalogController } from "./http/catalog.controller";

/** Salon service catalogue (07 M7.4). Topic 08's AI import writes drafts through CatalogService. */
@Module({
  controllers: [CatalogController],
  providers: [CatalogService],
  exports: [CatalogService],
})
export class CatalogModule {}
