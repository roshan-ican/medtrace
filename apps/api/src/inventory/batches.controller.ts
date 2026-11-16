import { BadRequestException, Controller, Get, NotFoundException, Param, ParseIntPipe } from "@nestjs/common";
import { Database } from "../database";

@Controller("batches")
export class BatchesController {
    constructor(private readonly database: Database) { }

    @Get(":id")
    async findOne(@Param("id", ParseIntPipe) id: number) {
        if (id < 1 || id > 2_147_483_647) {
            throw new BadRequestException("Batch ID must be a positive 32-bit integer");
        }
        const batch = await this.database.getBatch(id);
        if (!batch) {
            throw new NotFoundException(`Batch with id ${id} not found`);
        }
        return batch
    }
}
